import { isAbortLikeError } from './opencode-provider-bootstrap.js'
import {
  mapOpencodeAgentMessageIdFromEvent,
  mapOpencodeTextDeltaFromEvent,
  mapOpencodeTextPartStateFromEvent,
  mapOpencodeUsageFromEvent,
} from './opencode-provider-utils.js'
import {
  buildProviderSdkError,
  isRetryableProviderError,
  isTransientProviderFailure,
  ProviderError,
  readProviderErrorCode,
} from './provider-error.js'
export { isSameUsage } from '../shared/token-usage.js'

import type { mapOpencodeUsage } from './opencode-provider-utils.js'
import type { createOpencodeClient } from '@opencode-ai/sdk/v2'

export type UsageStreamMonitor = {
  stop: () => void
  done: Promise<void>
}

export const wrapSdkError = (error: unknown): Error => {
  if (error instanceof ProviderError) return error
  return buildProviderSdkError({
    providerId: 'opencode',
    message: error instanceof Error ? error.message : String(error),
    transient: isTransientProviderError(error),
  })
}

export const isTransientProviderError = (error: unknown): boolean => {
  if (isRetryableProviderError(error)) return true
  return isTransientProviderFailure(error)
}

export const shouldSkipFailureCount = (error: Error): boolean =>
  isAbortLikeError(error) ||
  readProviderErrorCode(error) === 'provider_preflight_failed' ||
  /preflight failed/i.test(error.message)

const isAbortLikeStreamError = (
  error: unknown,
  signal: AbortSignal,
): boolean => {
  if (signal.aborted) return true
  return isAbortLikeError(error)
}

const UNKNOWN_TEXT_PART_FLUSH_DELAY_MS = 300

export const startUsageStreamMonitor = (params: {
  client: ReturnType<typeof createOpencodeClient>
  workDir: string
  sessionID: string
  minCreatedAt: number
  abortSignal: AbortSignal
  onUsage: (usage: ReturnType<typeof mapOpencodeUsage>) => void
  onTextDelta?: (delta: string) => void
}): UsageStreamMonitor => {
  const streamAbort = new AbortController()
  const activeMessageIDs = new Set<string>()
  const visibleTextPartIDs = new Set<string>()
  const hiddenTextPartIDs = new Set<string>()
  const pendingDeltas = new Map<
    string,
    {
      messageID: string
      chunks: string[]
      firstSeenAt: number
    }
  >()

  const flushPartDeltas = (partID: string, now = Date.now()): void => {
    const pending = pendingDeltas.get(partID)
    if (!pending) return
    if (!activeMessageIDs.has(pending.messageID)) return
    if (hiddenTextPartIDs.has(partID)) return
    if (
      !visibleTextPartIDs.has(partID) &&
      now - pending.firstSeenAt < UNKNOWN_TEXT_PART_FLUSH_DELAY_MS
    )
      return
    for (const chunk of pending.chunks) params.onTextDelta?.(chunk)
    pendingDeltas.delete(partID)
  }
  const flushEligiblePending = (now = Date.now()): void => {
    for (const [partID, pending] of pendingDeltas) {
      if (!activeMessageIDs.has(pending.messageID)) continue
      flushPartDeltas(partID, now)
    }
  }

  const forwardAbort = (): void => streamAbort.abort()
  if (params.abortSignal.aborted) streamAbort.abort()
  else params.abortSignal.addEventListener('abort', forwardAbort)

  const done = (async () => {
    try {
      const eventStream = await params.client.event.subscribe(
        { directory: params.workDir },
        {
          signal: streamAbort.signal,
          throwOnError: true,
        },
      )
      for await (const event of eventStream.stream) {
        const now = Date.now()
        const messageID = mapOpencodeAgentMessageIdFromEvent(
          event,
          params.sessionID,
          params.minCreatedAt,
        )
        if (messageID) {
          if (!activeMessageIDs.has(messageID)) {
            activeMessageIDs.add(messageID)
            for (const [partID, pending] of pendingDeltas) {
              if (pending.messageID !== messageID) {
                pendingDeltas.delete(partID)
                continue
              }
              flushPartDeltas(partID, now)
            }
          }
        }

        const textPartState = mapOpencodeTextPartStateFromEvent(
          event,
          params.sessionID,
        )
        if (textPartState) {
          if (
            activeMessageIDs.size === 0 ||
            activeMessageIDs.has(textPartState.messageID)
          ) {
            if (textPartState.visible) {
              visibleTextPartIDs.add(textPartState.partID)
              hiddenTextPartIDs.delete(textPartState.partID)
              flushPartDeltas(textPartState.partID, now)
            } else {
              hiddenTextPartIDs.add(textPartState.partID)
              visibleTextPartIDs.delete(textPartState.partID)
              pendingDeltas.delete(textPartState.partID)
            }
          }
        }

        const usage = mapOpencodeUsageFromEvent(
          event,
          params.sessionID,
          params.minCreatedAt,
        )
        if (usage) params.onUsage(usage)

        const delta = mapOpencodeTextDeltaFromEvent(event, params.sessionID)
        if (!delta) {
          flushEligiblePending(now)
          continue
        }
        if (activeMessageIDs.size > 0 && !activeMessageIDs.has(delta.messageID))
          continue
        if (
          activeMessageIDs.has(delta.messageID) &&
          visibleTextPartIDs.has(delta.partID)
        ) {
          params.onTextDelta?.(delta.delta)
          continue
        }
        if (hiddenTextPartIDs.has(delta.partID)) continue
        const existing = pendingDeltas.get(delta.partID)
        if (existing?.messageID === delta.messageID)
          existing.chunks.push(delta.delta)
        else {
          pendingDeltas.set(delta.partID, {
            messageID: delta.messageID,
            chunks: [delta.delta],
            firstSeenAt: now,
          })
        }
        flushPartDeltas(delta.partID, now)
        flushEligiblePending(now)
      }
    } catch (error) {
      if (!isAbortLikeStreamError(error, streamAbort.signal)) throw error
    } finally {
      params.abortSignal.removeEventListener('abort', forwardAbort)
    }
  })()

  return {
    stop: () => streamAbort.abort(),
    done,
  }
}
