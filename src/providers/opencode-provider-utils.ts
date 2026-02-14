import type { TokenUsage } from '../types/index.js'
import type { AssistantMessage, Event, Part } from '@opencode-ai/sdk/v2'

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized ? normalized : undefined
}

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

type OpencodeModelRef = {
  providerID: string
  modelID: string
}

const resolveOpencodeModel = (
  requested?: string,
  fallback = 'opencode/big-pickle',
): string => {
  const fromRequest = readString(requested)
  if (fromRequest?.includes('/')) return fromRequest
  const fromEnv = readString(process.env.MIMIKIT_OPENCODE_MODEL)
  if (fromEnv?.includes('/')) return fromEnv
  return fallback
}

export const resolveOpencodeModelRef = (
  requested?: string,
  fallback = 'opencode/big-pickle',
): OpencodeModelRef => {
  const resolved = resolveOpencodeModel(requested, fallback)
  const parts = resolved
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    const providerID = parts[0]
    const modelID = parts.slice(1).join('/')
    if (providerID && modelID) return { providerID, modelID }
  }
  return { providerID: 'opencode', modelID: 'big-pickle' }
}

export const extractOpencodeOutput = (parts: Part[]): string =>
  parts
    .filter(
      (part): part is Extract<Part, { type: 'text' }> => part.type === 'text',
    )
    .filter((part) => !part.ignored)
    .map((part) => part.text)
    .join('')
    .trim()

export const mapOpencodeUsage = (
  message: AssistantMessage | undefined,
): TokenUsage | undefined => {
  const tokens = message?.tokens
  const input = readNumber(tokens?.input)
  const output = readNumber(tokens?.output)
  const reasoning = readNumber(tokens?.reasoning)
  if (input === undefined && output === undefined && reasoning === undefined)
    return undefined

  const total = (input ?? 0) + (output ?? 0) + (reasoning ?? 0)
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    total,
  }
}

export const mapOpencodeUsageFromEvent = (
  event: Event | undefined,
  sessionID?: string,
  minCreatedAt?: number,
): TokenUsage | undefined => {
  if (event?.type !== 'message.updated') return undefined
  const { info } = event.properties
  if (info.role !== 'assistant') return undefined
  if (sessionID && info.sessionID !== sessionID) return undefined
  if (
    minCreatedAt !== undefined &&
    Number.isFinite(minCreatedAt) &&
    info.time.created < minCreatedAt
  )
    return undefined
  return mapOpencodeUsage(info)
}
