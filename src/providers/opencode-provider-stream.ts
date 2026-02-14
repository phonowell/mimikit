import { isAbortLikeError } from './opencode-provider-bootstrap.js'
import {
  mapOpencodeAssistantMessageIdFromEvent,
  mapOpencodeTextDeltaFromEvent,
  mapOpencodeUsageFromEvent,
} from './opencode-provider-utils.js'

import type { mapOpencodeUsage } from './opencode-provider-utils.js'
import type { createOpencodeClient } from '@opencode-ai/sdk/v2'

export type UsageStreamMonitor = {
  stop: () => void
  done: Promise<void>
}

export const wrapSdkError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error)
  if (message.startsWith('[provider:opencode]')) return new Error(message)
  return new Error(`[provider:opencode] sdk run failed: ${message}`)
}

export const isTransientProviderError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /fetch failed/i.test(message) ||
    /socket hang up/i.test(message) ||
    /ECONNRESET/i.test(message) ||
    /ECONNREFUSED/i.test(message) ||
    /EAI_AGAIN/i.test(message) ||
    /ETIMEDOUT/i.test(message) ||
    /timed out/i.test(message) ||
    /network/i.test(message)
  )
}

export const shouldSkipFailureCount = (error: Error): boolean =>
  isAbortLikeError(error) || /preflight failed/i.test(error.message)

export const isSameUsage = (
  left: ReturnType<typeof mapOpencodeUsage> | undefined,
  right: ReturnType<typeof mapOpencodeUsage> | undefined,
): boolean =>
  left?.input === right?.input &&
  left?.output === right?.output &&
  left?.total === right?.total

const isAbortLikeStreamError = (
  error: unknown,
  signal: AbortSignal,
): boolean => {
  if (signal.aborted) return true
  return isAbortLikeError(error)
}

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
  const pendingDeltas = new Map<string, string[]>()

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
        const messageID = mapOpencodeAssistantMessageIdFromEvent(
          event,
          params.sessionID,
          params.minCreatedAt,
        )
        if (messageID) {
          if (!activeMessageIDs.has(messageID)) {
            activeMessageIDs.add(messageID)
            const pending = pendingDeltas.get(messageID)
            if (pending && pending.length > 0)
              for (const chunk of pending) params.onTextDelta?.(chunk)

            pendingDeltas.clear()
          }
        }

        const usage = mapOpencodeUsageFromEvent(
          event,
          params.sessionID,
          params.minCreatedAt,
        )
        if (usage) params.onUsage(usage)

        const delta = mapOpencodeTextDeltaFromEvent(event, params.sessionID)
        if (!delta) continue
        if (activeMessageIDs.has(delta.messageID)) {
          params.onTextDelta?.(delta.delta)
          continue
        }
        if (activeMessageIDs.size > 0) continue
        const existing = pendingDeltas.get(delta.messageID)
        if (existing) existing.push(delta.delta)
        else pendingDeltas.set(delta.messageID, [delta.delta])
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
