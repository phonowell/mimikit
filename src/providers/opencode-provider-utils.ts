import type { TokenUsage } from '../types/index.js'
import type { AssistantMessage, Event, Part } from '@opencode-ai/sdk/v2'

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized ? normalized : undefined
}

const readNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized) return undefined
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

const normalizeEpochMs = (value: unknown): number | undefined => {
  const numeric = readNumber(value)
  if (numeric === undefined) return undefined
  // opencode timestamps can be second-based; normalize to milliseconds.
  return numeric >= 100_000_000_000 ? numeric : numeric * 1000
}

const readAssistantMessageFromEvent = (
  event: Event | undefined,
  sessionID?: string,
  minCreatedAt?: number,
): AssistantMessage | undefined => {
  if (event?.type !== 'message.updated') return undefined
  const { info } = event.properties
  if (info.role !== 'assistant') return undefined
  if (sessionID && info.sessionID !== sessionID) return undefined
  if (minCreatedAt !== undefined && Number.isFinite(minCreatedAt)) {
    const createdAtMs = normalizeEpochMs(info.time.created)
    const minCreatedAtMs = normalizeEpochMs(minCreatedAt)
    if (
      createdAtMs !== undefined &&
      minCreatedAtMs !== undefined &&
      createdAtMs < minCreatedAtMs
    )
      return undefined
  }
  return info
}

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

export const isVisibleOpencodeTextPart = (
  part: Part,
): part is Extract<Part, { type: 'text' }> =>
  part.type === 'text' && !part.ignored

export const extractOpencodeOutput = (parts: Part[]): string =>
  parts
    .filter((part) => isVisibleOpencodeTextPart(part))
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
  const totalFromToken = readNumber(tokens?.total)
  const totalFromParts =
    input !== undefined || output !== undefined || reasoning !== undefined
      ? (input ?? 0) + (output ?? 0) + (reasoning ?? 0)
      : undefined
  const total = totalFromToken ?? totalFromParts
  if (input === undefined && output === undefined && total === undefined)
    return undefined

  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
  }
}

export const mapOpencodeUsageFromEvent = (
  event: Event | undefined,
  sessionID?: string,
  minCreatedAt?: number,
): TokenUsage | undefined => {
  const message = readAssistantMessageFromEvent(event, sessionID, minCreatedAt)
  if (!message) return undefined
  return mapOpencodeUsage(message)
}

export const mapOpencodeAssistantMessageIdFromEvent = (
  event: Event | undefined,
  sessionID?: string,
  minCreatedAt?: number,
): string | undefined =>
  readAssistantMessageFromEvent(event, sessionID, minCreatedAt)?.id

export const mapOpencodeTextDeltaFromEvent = (
  event: Event | undefined,
  sessionID?: string,
): { messageID: string; partID: string; delta: string } | undefined => {
  if (event?.type !== 'message.part.delta') return undefined
  const { properties } = event
  if (sessionID && properties.sessionID !== sessionID) return undefined
  if (properties.field !== 'text') return undefined
  if (typeof properties.partID !== 'string' || properties.partID.length === 0)
    return undefined
  const { delta } = properties
  if (typeof delta !== 'string' || delta.length === 0) return undefined
  return { messageID: properties.messageID, partID: properties.partID, delta }
}

export const mapOpencodeTextPartStateFromEvent = (
  event: Event | undefined,
  sessionID?: string,
): { messageID: string; partID: string; visible: boolean } | undefined => {
  if (event?.type !== 'message.part.updated') return undefined
  const { part } = event.properties
  if (sessionID && part.sessionID !== sessionID) return undefined
  return {
    messageID: part.messageID,
    partID: part.id,
    visible: isVisibleOpencodeTextPart(part),
  }
}
