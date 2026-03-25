import { spawn } from 'node:child_process'
import { readdir, rm, stat } from 'node:fs/promises'
import { join, parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import { ensureDir } from '../../persistence/fs/paths.js'

const RESETTABLE_STATE_ENTRY_NAMES = new Set([
  '.instance',
  '.instance.lock',
  'generated',
  'history',
  'history.lock',
  'inputs',
  'log.jsonl',
  'memory',
  'results',
  'runtime',
  'runtime-snapshot.json',
  'runtime-snapshot.json.bak',
  'task-progress',
  'tasks',
  'traces',
  'usage',
])

const REQUIRED_WEBUI_ENTRY_FILES = ['app.js', 'archive-viewer.js'] as const

type WebUiBuildPaths = {
  rootDir: string
  webDir: string
  generatedDir: string
  webuiSourceDir: string
  buildScriptPath: string
  tsconfigPath: string
}

export const resolveRoots = (): WebUiBuildPaths => {
  const __dirname = fileURLToPath(new URL('.', import.meta.url))
  const rootDir = resolve(__dirname, '..', '..', '..')
  return {
    buildScriptPath: resolve(rootDir, 'scripts', 'build-webui.mjs'),
    generatedDir: resolve(rootDir, 'webui', 'generated'),
    rootDir,
    webDir: resolve(rootDir, 'webui'),
    webuiSourceDir: resolve(rootDir, 'webui-src'),
    tsconfigPath: resolve(rootDir, 'tsconfig.webui.json'),
  }
}

const readMtimeMs = async (path: string): Promise<number | null> => {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return null
  }
}

const readNewestMtimeMs = async (path: string): Promise<number> => {
  const stats = await stat(path)
  if (!stats.isDirectory()) return stats.mtimeMs

  const entries = await readdir(path, { withFileTypes: true })
  let newest = 0
  for (const entry of entries) {
    const entryPath = join(path, entry.name)
    const entryMtimeMs = entry.isDirectory()
      ? await readNewestMtimeMs(entryPath)
      : ((await readMtimeMs(entryPath)) ?? 0)
    if (entryMtimeMs > newest) newest = entryMtimeMs
  }
  return newest
}

export const shouldBuildWebUiGenerated = async (
  paths: Pick<
    WebUiBuildPaths,
    'buildScriptPath' | 'generatedDir' | 'tsconfigPath' | 'webuiSourceDir'
  >,
): Promise<boolean> => {
  const requiredGeneratedPaths = REQUIRED_WEBUI_ENTRY_FILES.map((name) =>
    join(paths.generatedDir, name),
  )
  const generatedMtimes = await Promise.all(
    requiredGeneratedPaths.map((path) => readMtimeMs(path)),
  )
  if (generatedMtimes.some((mtimeMs) => mtimeMs === null)) return true

  const chunkEntries = await readdir(join(paths.generatedDir, 'chunks')).catch(
    () => null,
  )
  if (!chunkEntries || chunkEntries.length === 0) return true

  const generatedFloorMtimeMs = Math.min(...(generatedMtimes as number[]))
  const sourceCeilingMtimeMs = Math.max(
    await readNewestMtimeMs(paths.webuiSourceDir),
    (await readMtimeMs(paths.buildScriptPath)) ?? 0,
    (await readMtimeMs(paths.tsconfigPath)) ?? 0,
  )
  return generatedFloorMtimeMs < sourceCeilingMtimeMs
}

export const ensureWebUiGenerated = async (): Promise<void> => {
  const roots = resolveRoots()
  if (!(await shouldBuildWebUiGenerated(roots))) return

  await new Promise<void>((resolveBuild, rejectBuild) => {
    const child = spawn(process.execPath, ['scripts/build-webui.mjs'], {
      cwd: roots.rootDir,
      stdio: 'inherit',
    })
    child.once('error', (error) => {
      rejectBuild(error)
    })
    child.once('exit', (code) => {
      if (code === 0) {
        resolveBuild()
        return
      }
      rejectBuild(
        new Error(`build:webui failed with exit code ${code ?? 'unknown'}`),
      )
    })
  })
}

const isSafeStateDir = (stateDir: string): boolean => {
  const trimmed = stateDir.trim()
  if (!trimmed) return false
  const resolved = resolve(stateDir)
  const { root } = parse(resolved)
  if (!root) return false
  return resolved !== root
}

export const clearStateDir = async (stateDir: string): Promise<void> => {
  const resolved = resolve(stateDir)
  if (!isSafeStateDir(resolved))
    throw new Error(`refusing to clear unsafe state dir: ${resolved}`)

  await ensureDir(resolved)
  const entries = await readdir(resolved, { withFileTypes: true })
  const hasUnexpectedEntry = entries.some(
    (entry) => !RESETTABLE_STATE_ENTRY_NAMES.has(entry.name),
  )
  if (hasUnexpectedEntry)
    throw new Error(`refusing to clear unsafe state dir: ${resolved}`)

  await Promise.all(
    entries.map((entry) =>
      rm(join(resolved, entry.name), { recursive: true, force: true }),
    ),
  )
}

const trimmedStringOrUndefinedSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}, z.string().optional())

const inputBodySchema = z
  .object({
    text: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z.string().min(1),
    ),
    quote: trimmedStringOrUndefinedSchema.optional(),
    language: trimmedStringOrUndefinedSchema.optional(),
    clientLocale: trimmedStringOrUndefinedSchema.optional(),
    clientTimeZone: trimmedStringOrUndefinedSchema.optional(),
    clientOffsetMinutes: z.number().finite().optional(),
    clientNowIso: trimmedStringOrUndefinedSchema.optional(),
  })
  .strict()

export type InputMeta = {
  source: string
  platform?: string
  remote?: string
  userAgent?: string
  language?: string
  clientLocale?: string
  clientTimeZone?: string
  clientOffsetMinutes?: number
  clientNowIso?: string
}

export const parseInputBody = (
  body: unknown,
  request: {
    remoteAddress?: string | undefined
    userAgent?: string | undefined
    acceptLanguage?: string | undefined
  },
): { text: string; meta: InputMeta; quote?: string } | { error: string } => {
  const parsed = inputBodySchema.safeParse(body)
  if (!parsed.success) {
    const hasTextIssue = parsed.error.issues.some(
      (issue) => issue.path[0] === 'text',
    )
    return { error: hasTextIssue ? 'text is required' : 'invalid JSON' }
  }
  const {
    text,
    language: bodyLanguage,
    clientLocale,
    clientTimeZone,
    clientOffsetMinutes,
    clientNowIso,
    quote,
  } = parsed.data

  const meta: InputMeta = { source: 'webui', platform: 'webui' }
  if (request.remoteAddress) meta.remote = request.remoteAddress
  if (request.userAgent) meta.userAgent = request.userAgent
  const language = bodyLanguage ?? request.acceptLanguage
  if (language) meta.language = language
  if (clientLocale) meta.clientLocale = clientLocale
  if (clientTimeZone) meta.clientTimeZone = clientTimeZone
  if (clientOffsetMinutes !== undefined)
    meta.clientOffsetMinutes = clientOffsetMinutes
  if (clientNowIso) meta.clientNowIso = clientNowIso
  return quote ? { text, meta, quote } : { text, meta }
}
