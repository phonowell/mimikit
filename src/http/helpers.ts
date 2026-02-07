import { rm } from 'node:fs/promises'
import { parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

export const parseExportLimit = (value: unknown): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 200
  return Math.min(Math.floor(parsed), 1000)
}

export const resolveRoots = () => {
  const __dirname = fileURLToPath(new URL('.', import.meta.url))
  const rootDir = resolve(__dirname, '..', '..')
  return {
    rootDir,
    webDir: resolve(__dirname, '..', 'webui'),
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

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const asFiniteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

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
  if (!body || typeof body !== 'object') return { error: 'invalid JSON' }
  const parsed = body as Record<string, unknown>
  const text = asString(parsed.text)?.trim() ?? ''
  if (!text) return { error: 'text is required' }
  const bodyLanguage = asString(parsed.language)
  const language = bodyLanguage ?? request.acceptLanguage
  const meta: InputMeta = { source: 'http' }
  if (request.remoteAddress) meta.remote = request.remoteAddress
  if (request.userAgent) meta.userAgent = request.userAgent
  if (language) meta.language = language
  const clientLocale = asString(parsed.clientLocale)
  if (clientLocale) meta.clientLocale = clientLocale
  const clientTimeZone = asString(parsed.clientTimeZone)
  if (clientTimeZone) meta.clientTimeZone = clientTimeZone
  const clientOffset = asFiniteNumber(parsed.clientOffsetMinutes)
  if (clientOffset !== undefined) meta.clientOffsetMinutes = clientOffset
  const clientNow = asString(parsed.clientNowIso)
  if (clientNow) meta.clientNowIso = clientNow
  const quote = asString(parsed.quote)?.trim()
  return quote ? { text, meta, quote } : { text, meta }
}
