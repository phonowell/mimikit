import { resolveSystemEvent } from '../shared/system-event.js'

import type { ChatMessage } from '../orchestrator/read-model/chat-view.js'
import type { MessageVisibility } from '../types/index.js'

const SUMMARY_MAX_LENGTH = 120
const MAX_TRACKED_SIGNATURES = 500
const INGRESS_MESSAGE_TAG = '[http] session ingress message'
const INGRESS_BATCH_TAG = '[http] session ingress batch'

type MessagePayload = {
  messages?: ChatMessage[]
  mode?: unknown
}

type IngressLogEntry = {
  id?: string
  role: string
  type: string
  source: string
  visibility: MessageVisibility | 'unknown'
  summary: string
}

type IngressBatchEntry = {
  mode: string
  incomingCount: number
  loggedCount: number
  skippedCount: number
}

type IngressLogSink = (
  tag: typeof INGRESS_MESSAGE_TAG | typeof INGRESS_BATCH_TAG,
  payload: IngressLogEntry | IngressBatchEntry,
) => void

const compactText = (value: unknown): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

const summarizeText = (
  value: unknown,
  maxLength = SUMMARY_MAX_LENGTH,
): string => {
  const normalized = compactText(value)
  if (!normalized) return ''
  if (!Number.isFinite(maxLength) || maxLength <= 0) return normalized
  const limit = Math.floor(maxLength)
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit)}...`
}

const asMessagePayload = (value: unknown): MessagePayload | null =>
  value && typeof value === 'object' ? (value as MessagePayload) : null

const resolveMode = (value: unknown): string => {
  const mode = asMessagePayload(value)?.mode
  if (typeof mode !== 'string') return 'full'
  const normalized = compactText(mode).toLowerCase()
  return normalized || 'full'
}

const resolveType = (
  message: ChatMessage,
  systemEventName?: string,
): string => {
  if (message.role === 'system')
    return systemEventName ? `system_event:${systemEventName}` : 'system'
  if (message.role === 'user') return 'user_message'
  return 'agent_message'
}

const resolveSource = (
  message: ChatMessage,
  systemPayload?: Record<string, unknown>,
  systemEventName?: string,
): string => {
  if (message.role === 'user') {
    const source = compactText(message.source)
    if (source) return source
    const platform = compactText(message.platform)
    if (platform) return platform
    return 'unknown'
  }
  if (message.role !== 'system') return 'unknown'
  const payloadSource = compactText(systemPayload?.source)
  if (payloadSource) return payloadSource
  if (systemEventName) return `system_event:${systemEventName}`
  return 'unknown'
}

const resolveVisibility = (
  message: ChatMessage,
): MessageVisibility | 'unknown' => {
  if (message.role !== 'system') return 'all'
  return message.visibility
}

const buildMessageLogEntry = (message: ChatMessage): IngressLogEntry => {
  const role = compactText(message.role).toLowerCase() || 'unknown'
  const parsedSystemEvent =
    message.role === 'system'
      ? resolveSystemEvent({
          text: message.text,
          ...(message.systemEventName
            ? { systemEventName: message.systemEventName }
            : {}),
          ...(message.systemEventPayload
            ? { systemEventPayload: message.systemEventPayload }
            : {}),
        })
      : undefined
  const summary =
    message.role === 'system'
      ? summarizeText(parsedSystemEvent?.summary)
      : summarizeText(message.text)

  return {
    ...(typeof message.id === 'string' ? { id: message.id } : {}),
    role,
    type: resolveType(message, parsedSystemEvent?.name),
    source: resolveSource(
      message,
      parsedSystemEvent?.payload,
      parsedSystemEvent?.name,
    ),
    visibility: resolveVisibility(message),
    summary: summary || '(empty)',
  }
}

const defaultSink: IngressLogSink = () => undefined

export const createSessionIngressLogger = (options?: {
  sink?: IngressLogSink
}): {
  logIncomingMessages: (value: unknown) => void
} => {
  const sink = options?.sink ?? defaultSink
  const signatureByMessageId = new Map<string, string>()
  let anonymousCounter = 0

  const trimTrackedSignatures = () => {
    while (signatureByMessageId.size > MAX_TRACKED_SIGNATURES) {
      const oldestKey = signatureByMessageId.keys().next().value
      if (oldestKey === undefined) break
      signatureByMessageId.delete(oldestKey)
    }
  }

  const logIncomingMessages = (value: unknown): void => {
    const payload = asMessagePayload(value)
    const incoming = payload?.messages
    if (!Array.isArray(incoming) || incoming.length === 0) return

    let loggedCount = 0
    let skippedCount = 0
    for (let index = 0; index < incoming.length; index += 1) {
      const message = incoming[index]
      if (!message) continue
      const entry = buildMessageLogEntry(message)
      const dedupeId = entry.id ?? `anon-${anonymousCounter + index}`
      const signature = JSON.stringify(entry)
      if (signatureByMessageId.get(dedupeId) === signature) {
        skippedCount += 1
        continue
      }
      signatureByMessageId.set(dedupeId, signature)
      trimTrackedSignatures()
      sink(INGRESS_MESSAGE_TAG, entry)
      loggedCount += 1
    }
    anonymousCounter += incoming.length

    if (loggedCount > 0 || skippedCount > 0) {
      sink(INGRESS_BATCH_TAG, {
        mode: resolveMode(payload),
        incomingCount: incoming.length,
        loggedCount,
        skippedCount,
      })
    }
  }

  return { logIncomingMessages }
}
