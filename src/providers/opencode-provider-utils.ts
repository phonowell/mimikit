import { readNonEmptyString } from '../shared/input-parsing.js'

import type { TokenUsage } from '../types/index.js'
import type { Event, Part } from '@opencode-ai/sdk/v2'

type OpencodeTokens = {
  input?: unknown
  output?: unknown
  reasoning?: unknown
  total?: unknown
  cache?: {
    read?: unknown
    write?: unknown
  }
}

type OpencodeAgentMessage = {
  id: string
  role: 'agent'
  sessionID: string
  time: {
    created: unknown
  }
  tokens?: OpencodeTokens
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

const readAgentMessageFromEvent = (
  event: Event | undefined,
  sessionID?: string,
  minCreatedAt?: number,
): OpencodeAgentMessage | undefined => {
  if (event?.type !== 'message.updated') return undefined
  const info = (event.properties as { info?: unknown }).info as
    | {
        id?: unknown
        role?: unknown
        sessionID?: unknown
        time?: { created?: unknown }
        tokens?: OpencodeTokens
      }
    | undefined
  if (!info) return undefined
  if (typeof info.role !== 'string') return undefined
  if (info.role === 'user' || info.role === 'system' || info.role === 'tool')
    return undefined
  if (typeof info.id !== 'string' || !info.id.trim()) return undefined
  if (typeof info.sessionID !== 'string' || !info.sessionID.trim())
    return undefined
  if (!info.time || !('created' in info.time)) return undefined
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
  return {
    id: info.id,
    role: 'agent',
    sessionID: info.sessionID,
    time: { created: info.time.created },
    ...(info.tokens ? { tokens: info.tokens } : {}),
  }
}
type OpencodeModelRef = {
  providerID: string
  modelID: string
}

const resolveOpencodeModel = (
  requested?: string,
  fallback = 'opencode/big-pickle',
): string => {
  const fromRequest = readNonEmptyString(requested)
  if (fromRequest?.includes('/')) return fromRequest
  const fromEnv = readNonEmptyString(process.env.MIMIKIT_OPENCODE_MODEL)
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
  message: { tokens?: OpencodeTokens } | undefined,
): TokenUsage | undefined => mapOpencodeUsageFromTokens(message?.tokens)
const mapOpencodeUsageFromTokens = (
  tokens: OpencodeTokens | undefined,
): TokenUsage | undefined => {
  const input = readNumber(tokens?.input)
  const output = readNumber(tokens?.output)
  const reasoning = readNumber(tokens?.reasoning)
  const sessionTotal = readNumber(tokens?.total)
  const cacheRead = readNumber(tokens?.cache?.read)
  const cacheWrite = readNumber(tokens?.cache?.write)
  const totalFromParts =
    input !== undefined || output !== undefined || reasoning !== undefined
      ? (input ?? 0) + (output ?? 0) + (reasoning ?? 0)
      : undefined
  const total = totalFromParts
  if (
    (input === undefined &&
      output === undefined &&
      total === undefined &&
      sessionTotal === undefined &&
      cacheRead === undefined &&
      cacheWrite === undefined) ||
    ((input ?? 0) === 0 &&
      (output ?? 0) === 0 &&
      (total ?? 0) === 0 &&
      (sessionTotal ?? 0) === 0 &&
      (cacheRead ?? 0) === 0 &&
      (cacheWrite ?? 0) === 0)
  )
    return undefined

  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(sessionTotal !== undefined ? { sessionTotal } : {}),
    ...(cacheRead !== undefined ? { cacheRead } : {}),
    ...(cacheWrite !== undefined ? { cacheWrite } : {}),
  }
}

export const mapOpencodeUsageFromEvent = (
  event: Event | undefined,
  sessionID?: string,
  minCreatedAt?: number,
): TokenUsage | undefined => {
  const message = readAgentMessageFromEvent(event, sessionID, minCreatedAt)
  if (message) return mapOpencodeUsage(message)
  if (event?.type !== 'message.part.updated') return undefined
  const { part } = event.properties
  if (part.type !== 'step-finish') return undefined
  if (sessionID && part.sessionID !== sessionID) return undefined
  return mapOpencodeUsageFromTokens(part.tokens)
}

export const mapOpencodeAgentMessageIdFromEvent = (
  event: Event | undefined,
  sessionID?: string,
  minCreatedAt?: number,
): string | undefined =>
  readAgentMessageFromEvent(event, sessionID, minCreatedAt)?.id

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
