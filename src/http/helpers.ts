import { rm } from 'node:fs/promises'
import { parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import { ensureDir } from '../fs/paths.js'

export const parseTaskLimit = (value: unknown): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 200
  return Math.min(Math.floor(parsed), 500)
}

export const parseMessageLimit = (value: unknown): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 50
  return Math.floor(parsed)
}

export const resolveRoots = () => {
  const __dirname = fileURLToPath(new URL('.', import.meta.url))
  const rootDir = resolve(__dirname, '..', '..')
  return {
    rootDir,
    webDir: resolve(rootDir, 'webui'),
    markedDir: resolve(rootDir, 'node_modules', 'marked', 'lib'),
    purifyDir: resolve(rootDir, 'node_modules', 'dompurify', 'dist'),
  }
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

  await rm(resolved, { recursive: true, force: true })
  await ensureDir(resolved)
}

const trimmedStringOrUndefinedSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}, z.string().optional())

const finiteNumberSchema = z.number().finite()

const inputTextSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.string().min(1),
)

const inputBodySchema = z
  .object({
    text: inputTextSchema,
    quote: trimmedStringOrUndefinedSchema.optional(),
    language: trimmedStringOrUndefinedSchema.optional(),
    clientLocale: trimmedStringOrUndefinedSchema.optional(),
    clientTimeZone: trimmedStringOrUndefinedSchema.optional(),
    clientOffsetMinutes: finiteNumberSchema.optional(),
    clientNowIso: trimmedStringOrUndefinedSchema.optional(),
  })
  .strict()

export type InputMeta = {
  source: string
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
  const parsedBody = inputBodySchema.safeParse(body)
  if (!parsedBody.success) {
    const hasTextIssue = parsedBody.error.issues.some(
      (issue) => issue.path[0] === 'text',
    )
    return { error: hasTextIssue ? 'text is required' : 'invalid JSON' }
  }
  const {
    text,
    language: bodyLanguage,
    clientLocale,
    clientTimeZone,
    clientOffsetMinutes: clientOffset,
    clientNowIso: clientNow,
    quote,
  } = parsedBody.data
  const language = bodyLanguage ?? request.acceptLanguage
  const meta: InputMeta = { source: 'http' }
  if (request.remoteAddress) meta.remote = request.remoteAddress
  if (request.userAgent) meta.userAgent = request.userAgent
  if (language) meta.language = language
  if (clientLocale) meta.clientLocale = clientLocale
  if (clientTimeZone) meta.clientTimeZone = clientTimeZone
  if (clientOffset !== undefined) meta.clientOffsetMinutes = clientOffset
  if (clientNow) meta.clientNowIso = clientNow
  return quote ? { text, meta, quote } : { text, meta }
}
