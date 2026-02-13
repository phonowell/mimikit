import type { TokenUsage } from '../types/index.js'

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized ? normalized : undefined
}

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const readRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  return value as Record<string, unknown>
}

const readNumberByKeys = (
  record: Record<string, unknown> | undefined,
  keys: readonly string[],
): number | undefined => {
  if (!record) return undefined
  for (const key of keys) {
    const value = readNumber(record[key])
    if (value !== undefined) return value
  }
  return undefined
}

export const parseJsonLine = (
  line: string,
): Record<string, unknown> | undefined => {
  try {
    const parsed = JSON.parse(line) as unknown
    return readRecord(parsed)
  } catch {
    return undefined
  }
}

export const readSessionId = (
  event: Record<string, unknown>,
): string | undefined => {
  const direct = readString(event.sessionID)
  if (direct) return direct
  const part = readRecord(event.part)
  return readString(part?.sessionID)
}

export const readEventText = (
  event: Record<string, unknown>,
): string | undefined => {
  if (readString(event.type) !== 'text') return undefined
  const part = readRecord(event.part)
  if (!part || readString(part.type) !== 'text') return undefined
  return readString(part.text)
}

export const readEventUsage = (
  event: Record<string, unknown>,
): TokenUsage | undefined => {
  if (readString(event.type) !== 'step_finish') return undefined
  const part = readRecord(event.part)
  const tokens = readRecord(part?.tokens)
  if (!tokens) return undefined
  const input = readNumberByKeys(tokens, ['input', 'input_tokens', 'prompt'])
  const output = readNumberByKeys(tokens, [
    'output',
    'output_tokens',
    'completion',
  ])
  const total = readNumberByKeys(tokens, ['total', 'total_tokens'])
  if (input === undefined && output === undefined && total === undefined)
    return undefined
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined
      ? { total }
      : input !== undefined && output !== undefined
        ? { total: input + output }
        : {}),
  }
}

export const mergeTokenUsage = (
  current: TokenUsage | undefined,
  next: TokenUsage,
): TokenUsage => {
  const input =
    next.input !== undefined
      ? (current?.input ?? 0) + next.input
      : current?.input
  const output =
    next.output !== undefined
      ? (current?.output ?? 0) + next.output
      : current?.output
  const total =
    next.total !== undefined
      ? (current?.total ?? 0) + next.total
      : current?.total

  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
  }
}

export const resolveOpencodeModel = (
  requested?: string,
  fallback = 'opencode/big-pickle',
): string => {
  const fromRequest = readString(requested)
  if (fromRequest?.includes('/')) return fromRequest
  const fromEnv = readString(process.env.MIMIKIT_OPENCODE_MODEL)
  if (fromEnv?.includes('/')) return fromEnv
  return fallback
}
