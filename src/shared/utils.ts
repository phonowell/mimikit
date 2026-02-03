import type { TokenUsage } from '../types/common.js'

export const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

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
  if (input !== undefined && output !== undefined) result.total = input + output
  else if (total !== undefined) result.total = total
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
