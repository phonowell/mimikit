import type { TokenUsage } from '../types/index.js'

export const newId = (): string => crypto.randomUUID().replace(/-/g, '')

export const shortId = (): string => newId().slice(0, 8)

export const nowIso = (): string => new Date().toISOString()

export const addSeconds = (iso: string, seconds: number): string => {
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return nowIso()
  return new Date(ts + seconds * 1000).toISOString()
}

export const isExpired = (iso: string, now = new Date()): boolean => {
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return true
  return ts <= now.getTime()
}

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
  total?: unknown
}): TokenUsage | undefined => {
  const input = asNumber(parts.input)
  const output = asNumber(parts.output)
  if (input === undefined && output === undefined) return undefined
  const total = asNumber(parts.total)
  const result: TokenUsage = {}
  if (input !== undefined) result.input = input
  if (output !== undefined) result.output = output
  if (total !== undefined) result.total = total
  else if (input !== undefined && output !== undefined)
    result.total = input + output
  return result
}

export const normalizeUsage = (
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  } | null,
): TokenUsage | undefined => {
  if (!usage) return undefined
  return normalizeUsageParts({
    input: usage.input_tokens,
    output: usage.output_tokens,
    total: usage.total_tokens,
  })
}

export const normalizeChatUsage = (
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  } | null,
): TokenUsage | undefined => {
  if (!usage) return undefined
  return normalizeUsageParts({
    input: usage.prompt_tokens,
    output: usage.completion_tokens,
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
