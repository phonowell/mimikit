import { createOpencodeClient } from '@opencode-ai/sdk/v2'
import CircuitBreaker from 'opossum'
import pRetry from 'p-retry'

import {
  ensureOpencodePreflight,
  isAbortLikeError,
  resolveServerTimeout,
  startOpencodeServer,
  unwrapSdkData,
} from './opencode-provider-bootstrap.js'
import {
  isSameUsage,
  isTransientProviderError,
  shouldSkipFailureCount,
  startUsageStreamMonitor,
  type UsageStreamMonitor,
  wrapSdkError,
} from './opencode-provider-stream.js'
import {
  extractOpencodeOutput,
  mapOpencodeUsage,
  resolveOpencodeModelRef,
} from './opencode-provider-utils.js'

import type {
  OpencodeProviderRequest,
  Provider,
  ProviderResult,
} from './types.js'
const RETRY_MAX_ATTEMPTS = 3
const runOpencodeOnce = async (
  request: OpencodeProviderRequest,
): Promise<ProviderResult> => {
  const startedAt = Date.now()
  const controller = new AbortController()
  const lifecycle = {
    timedOut: false,
    externallyAborted: false,
  }
  const onAbort = (): void => {
    lifecycle.externallyAborted = true
    controller.abort()
  }
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined
  if (request.timeoutMs > 0) {
    timeoutTimer = setTimeout(() => {
      lifecycle.timedOut = true
      controller.abort()
    }, request.timeoutMs)
  }
  if (request.abortSignal) {
    if (request.abortSignal.aborted) onAbort()
    else request.abortSignal.addEventListener('abort', onAbort)
  }
  let closeServer: (() => void) | undefined
  let usageMonitor: UsageStreamMonitor | undefined
  try {
    const model = resolveOpencodeModelRef(request.model)
    const server = await startOpencodeServer(
      controller.signal,
      resolveServerTimeout(request.timeoutMs),
    )
    closeServer = server.close
    const client = createOpencodeClient({ baseUrl: server.url })
    let sessionID = request.threadId ?? undefined
    if (!sessionID) {
      const created = await client.session.create(
        {
          directory: request.workDir,
          permission: [{ permission: '*', pattern: '*', action: 'allow' }],
        },
        {
          signal: controller.signal,
          responseStyle: 'data',
          throwOnError: true,
        },
      )
      sessionID = unwrapSdkData(created).id
    }
    if (!sessionID) throw new Error('[provider:opencode] missing session id')
    let latestUsage: ReturnType<typeof mapOpencodeUsage> | undefined
    const reportUsage = (usage: ReturnType<typeof mapOpencodeUsage>): void => {
      if (!usage || isSameUsage(latestUsage, usage)) return
      latestUsage = usage
      request.onUsage?.(usage)
    }
    usageMonitor = startUsageStreamMonitor({
      client,
      workDir: request.workDir,
      sessionID,
      minCreatedAt: Date.now(),
      abortSignal: controller.signal,
      onUsage: reportUsage,
      ...(request.onTextDelta ? { onTextDelta: request.onTextDelta } : {}),
    })
    const response = await client.session.prompt(
      {
        sessionID,
        directory: request.workDir,
        model,
        parts: [{ type: 'text', text: request.prompt }],
      },
      {
        signal: controller.signal,
        responseStyle: 'data',
        throwOnError: true,
      },
    )
    const promptResponse = unwrapSdkData(response)
    const promptUsage = mapOpencodeUsage(promptResponse.info)
    reportUsage(promptUsage)
    const usage = promptUsage ?? latestUsage
    return {
      output: extractOpencodeOutput(promptResponse.parts),
      elapsedMs: Math.max(0, Date.now() - startedAt),
      ...(usage ? { usage } : {}),
      threadId: sessionID,
    }
  } catch (error) {
    if (lifecycle.timedOut) {
      throw new Error(
        `[provider:opencode] timed out after ${request.timeoutMs}ms`,
      )
    }
    if (lifecycle.externallyAborted || controller.signal.aborted)
      throw new Error('[provider:opencode] aborted')
    throw wrapSdkError(error)
  } finally {
    clearTimeout(timeoutTimer)
    if (request.abortSignal)
      request.abortSignal.removeEventListener('abort', onAbort)
    if (usageMonitor) {
      usageMonitor.stop()
      await usageMonitor.done.catch(() => undefined)
    }
    if (closeServer) closeServer()
  }
}
const runOpencodeWithRetry = (
  request: OpencodeProviderRequest,
): Promise<ProviderResult> =>
  pRetry(() => runOpencodeOnce(request), {
    retries: Math.max(0, RETRY_MAX_ATTEMPTS - 1),
    factor: 2,
    minTimeout: 300,
    maxTimeout: 3_000,
    randomize: true,
    shouldConsumeRetry: ({ error }) =>
      !(isAbortLikeError(error) || !isTransientProviderError(error)),
    shouldRetry: ({ error }) =>
      !isAbortLikeError(error) && isTransientProviderError(error),
    onFailedAttempt: (attempt) => {
      if (attempt.retriesLeft <= 0) return
      const message =
        attempt.error instanceof Error
          ? attempt.error.message
          : String(attempt.error)
      console.warn(
        `[provider:opencode] transient failure, retry ${attempt.attemptNumber}/${RETRY_MAX_ATTEMPTS}: ${message}`,
      )
    },
  })
const opencodeBreaker = new CircuitBreaker(runOpencodeWithRetry, {
  timeout: 0,
  resetTimeout: 30_000,
  volumeThreshold: 3,
  errorThresholdPercentage: 50,
  errorFilter: shouldSkipFailureCount,
})
opencodeBreaker.on('open', () => {
  console.warn('[provider:opencode] circuit opened')
})
opencodeBreaker.on('halfOpen', () => {
  console.warn('[provider:opencode] circuit half-open')
})
opencodeBreaker.on('close', () => {
  console.warn('[provider:opencode] circuit closed')
})
const runOpencode = async (
  request: OpencodeProviderRequest,
): Promise<ProviderResult> => {
  ensureOpencodePreflight()
  try {
    return await opencodeBreaker.fire(request)
  } catch (error) {
    if (isAbortLikeError(error)) throw new Error('[provider:opencode] aborted')
    if (error instanceof Error && /breaker is open/i.test(error.message)) {
      throw new Error(
        '[provider:opencode] circuit is open due to consecutive failures',
      )
    }
    throw error
  }
}
export const opencodeProvider: Provider<OpencodeProviderRequest> = {
  id: 'opencode',
  run: runOpencode,
}
