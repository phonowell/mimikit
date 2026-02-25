import type { TokenUsage } from '../types/index.js'

export const newId = (): string => crypto.randomUUID().replace(/-/g, '')

export const shortId = (): string => newId().slice(0, 8)

export const nowIso = (): string => new Date().toISOString()

export const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const stripUndefined = <T extends Record<string, unknown>>(
  obj: T,
): { [K in keyof T]: Exclude<T[K], undefined> } =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as { [K in keyof T]: Exclude<T[K], undefined> }

const normalizeUsageParts = (parts: {
  input?: unknown
  output?: unknown
  inputCacheRead?: unknown
  inputCacheWrite?: unknown
  outputCache?: unknown
  total?: unknown
  sessionTotal?: unknown
}): TokenUsage | undefined => {
  const input = asNumber(parts.input)
  const output = asNumber(parts.output)
  const inputCacheRead = asNumber(parts.inputCacheRead)
  const inputCacheWrite = asNumber(parts.inputCacheWrite)
  const outputCache = asNumber(parts.outputCache)
  const total = asNumber(parts.total)
  const sessionTotal = asNumber(parts.sessionTotal)
  if (
    input === undefined &&
    output === undefined &&
    inputCacheRead === undefined &&
    inputCacheWrite === undefined &&
    outputCache === undefined &&
    total === undefined &&
    sessionTotal === undefined
  )
    return undefined
  const result: TokenUsage = {}
  if (input !== undefined) result.input = input
  if (output !== undefined) result.output = output
  if (inputCacheRead !== undefined) result.inputCacheRead = inputCacheRead
  if (inputCacheWrite !== undefined) result.inputCacheWrite = inputCacheWrite
  if (outputCache !== undefined) result.outputCache = outputCache
  if (total !== undefined) result.total = total
  else if (input !== undefined && output !== undefined)
    result.total = input + output
  if (sessionTotal !== undefined) result.sessionTotal = sessionTotal
  return result
}

export const normalizeUsage = (
  usage?: {
    input_tokens?: number
    cached_input_tokens?: number
    cache_write_input_tokens?: number
    output_tokens?: number
    cached_output_tokens?: number
    total_tokens?: number
  } | null,
): TokenUsage | undefined => {
  if (!usage) return undefined
  return normalizeUsageParts({
    input: usage.input_tokens,
    inputCacheRead: usage.cached_input_tokens,
    inputCacheWrite: usage.cache_write_input_tokens,
    output: usage.output_tokens,
    outputCache: usage.cached_output_tokens,
    total: usage.total_tokens,
  })
}

const summarizeLine = (text?: string, limit = 120): string => {
  if (!text) return ''
  const line =
    text
      .split('\n')
      .find((item) => item.trim())
      ?.trim() ?? ''
  if (!line) return ''
  if (line.length <= limit) return line
  const head = Math.max(0, limit - 3)
  return `${line.slice(0, head)}...`
}

const summaryFromCandidates = (
  candidates: Array<string | undefined>,
  limit = 120,
): string | undefined => {
  for (const candidate of candidates) {
    const summary = summarizeLine(candidate, limit)
    if (summary) return summary
  }
  return undefined
}

export const titleFromCandidates = (
  id: string,
  candidates: Array<string | undefined>,
  limit = 48,
): string => summaryFromCandidates(candidates, limit) ?? id
