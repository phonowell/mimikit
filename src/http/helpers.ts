import { rm } from 'node:fs/promises'
import { parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import { ensureDir } from '../fs/paths.js'

export const DEFAULT_TASK_LIMIT = 200
const MAX_TASK_LIMIT = 500
export const DEFAULT_MESSAGE_LIMIT = 50

const parseLimit = (
  value: unknown,
  fallback: number,
  max = Infinity,
): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.floor(parsed), max)
}

export const parseTaskLimit = (value: unknown): number =>
  parseLimit(value, DEFAULT_TASK_LIMIT, MAX_TASK_LIMIT)

export const parseMessageLimit = (value: unknown): number =>
  parseLimit(value, DEFAULT_MESSAGE_LIMIT)

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

  const meta: InputMeta = { source: 'http' }
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
