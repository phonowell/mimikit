import type { TokenUsage } from '../types/usage.js'

type JsonlEvent = {
  type?: string
  thread_id?: string
  item?: { type?: string; text?: string; [key: string]: unknown }
  response?: { usage?: unknown; metrics?: unknown; [key: string]: unknown }
  usage?: unknown
  [key: string]: unknown
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const num = Number(trimmed)
  if (!Number.isFinite(num)) return undefined
  return num
}

const normalizeUsage = (value: unknown): TokenUsage | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const input = toNumber(
    record.input_tokens ??
      record.prompt_tokens ??
      record.input_tokens_total ??
      record.input,
  )
  const output = toNumber(
    record.output_tokens ?? record.completion_tokens ?? record.output,
  )
  const total = toNumber(record.total_tokens ?? record.total ?? record.tokens)

  if (input === undefined && output === undefined && total === undefined)
    return undefined

  const usage: TokenUsage = {}
  if (input !== undefined) usage.input = input
  if (output !== undefined) usage.output = output
  if (total !== undefined) usage.total = total
  if (
    usage.total === undefined &&
    usage.input !== undefined &&
    usage.output !== undefined
  )
    usage.total = usage.input + usage.output
  return usage
}

const mergeUsage = (
  base: TokenUsage | undefined,
  next: TokenUsage,
): TokenUsage => {
  const merged: TokenUsage = { ...(base ?? {}), ...next }
  if (
    merged.total === undefined &&
    merged.input !== undefined &&
    merged.output !== undefined
  )
    merged.total = merged.input + merged.output
  return merged
}

const extractUsageFromEvent = (event: JsonlEvent): TokenUsage | undefined => {
  const direct = normalizeUsage(event.usage)
  if (direct) return direct
  if (event.response && typeof event.response === 'object') {
    const responseRecord = event.response as Record<string, unknown>
    const responseUsage = normalizeUsage(responseRecord.usage)
    if (responseUsage) return responseUsage
    const { metrics } = responseRecord
    if (metrics && typeof metrics === 'object') {
      const metricsUsage = normalizeUsage(
        (metrics as Record<string, unknown>).usage,
      )
      if (metricsUsage) return metricsUsage
    }
  }
  if (event.item && typeof event.item === 'object') {
    const itemUsage = normalizeUsage(
      (event.item as Record<string, unknown>).usage,
    )
    if (itemUsage) return itemUsage
  }
  return undefined
}

export const parseJsonlOutput = (
  output: string,
): {
  lastMessage: string
  usage: TokenUsage | undefined
} => {
  let lastMessage = ''
  let usage: TokenUsage | undefined

  for (const line of output.split('\n')) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line) as JsonlEvent

      if (
        event.type === 'item.completed' &&
        event.item?.type === 'agent_message' &&
        event.item.text
      )
        lastMessage = event.item.text

      const foundUsage = extractUsageFromEvent(event)
      if (foundUsage) usage = mergeUsage(usage, foundUsage)
    } catch {
      // skip non-JSON lines
    }
  }

  return { lastMessage, usage }
}
