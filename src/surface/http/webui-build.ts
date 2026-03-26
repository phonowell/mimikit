import { spawn } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED_WEBUI_ENTRY_FILES = ['app.js', 'archive-viewer.js'] as const
let activeWebUiBuild: Promise<void> | null = null

export type WebUiBuildPaths = {
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

const startWebUiBuild = async (
  roots: Pick<WebUiBuildPaths, 'rootDir'>,
): Promise<void> => {
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

const queueWebUiBuild = (
  roots: Pick<WebUiBuildPaths, 'rootDir'>,
): Promise<void> => {
  activeWebUiBuild ??= startWebUiBuild(roots).finally(() => {
    activeWebUiBuild = null
  })
  return activeWebUiBuild
}

export const ensureWebUiGenerated = async (): Promise<void> => {
  const roots = resolveRoots()
  if (!(await shouldBuildWebUiGenerated(roots))) return
  await queueWebUiBuild(roots)
}
