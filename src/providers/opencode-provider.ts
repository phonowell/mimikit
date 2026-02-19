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
import { ProviderError, readProviderErrorCode } from './provider-error.js'
import {
  bindExternalAbort,
  buildProviderResult,
  createProviderLifecycle,
  createTimeoutGuard,
} from './provider-runtime.js'

import type {
  OpencodeProviderRequest,
  Provider,
  ProviderResult,
} from './types.js'
const RETRY_MAX_ATTEMPTS = 3
const MANAGER_TIMEOUT_RETRY_MAX_ATTEMPTS = 2

const isProviderTimeoutError = (error: unknown): boolean =>
  readProviderErrorCode(error) === 'provider_timeout'

const resolveRetryMaxAttempts = (
  request: OpencodeProviderRequest,
  error: unknown,
): number => {
  if (request.role === 'manager' && isProviderTimeoutError(error))
    return MANAGER_TIMEOUT_RETRY_MAX_ATTEMPTS
  return RETRY_MAX_ATTEMPTS
}

const shouldRetryRequest = (params: {
  request: OpencodeProviderRequest
  error: unknown
  attemptNumber: number
}): boolean => {
  const { request, error, attemptNumber } = params
  if (error instanceof ProviderError) {
    if (!error.retryable) return false
    return attemptNumber < resolveRetryMaxAttempts(request, error)
  }
  if (isAbortLikeError(error)) return false
  if (!isTransientProviderError(error)) return false
  return attemptNumber < resolveRetryMaxAttempts(request, error)
}

const runOpencodeOnce = async (
  request: OpencodeProviderRequest,
): Promise<ProviderResult> => {
  const startedAt = Date.now()
  const controller = new AbortController()
  const lifecycle = createProviderLifecycle()
  const releaseExternalAbort = bindExternalAbort({
    controller,
    ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
    onAbort: () => {
      lifecycle.externallyAborted = true
    },
  })
  const timeoutGuard = createTimeoutGuard({
    controller,
    timeoutMs: request.timeoutMs,
    onTimeout: () => {
      lifecycle.timedOut = true
    },
  })
  timeoutGuard.arm()
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
    return buildProviderResult({
      startedAt,
      output: extractOpencodeOutput(promptResponse.parts),
      ...(usage ? { usage } : {}),
      threadId: sessionID,
    })
  } catch (error) {
    if (lifecycle.timedOut) {
      throw new ProviderError({
        code: 'provider_timeout',
        message: `[provider:opencode] timed out after ${request.timeoutMs}ms`,
        retryable: true,
      })
    }
    if (lifecycle.externallyAborted || controller.signal.aborted) {
      throw new ProviderError({
        code: 'provider_aborted',
        message: '[provider:opencode] aborted',
        retryable: false,
      })
    }
    throw wrapSdkError(error)
  } finally {
    timeoutGuard.clear()
    releaseExternalAbort()
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
    shouldConsumeRetry: ({ error, attemptNumber }) =>
      shouldRetryRequest({ request, error, attemptNumber }),
    shouldRetry: ({ error, attemptNumber }) =>
      shouldRetryRequest({ request, error, attemptNumber }),
    onFailedAttempt: (attempt) => {
      const shouldRetry = shouldRetryRequest({
        request,
        error: attempt.error,
        attemptNumber: attempt.attemptNumber,
      })
      if (!shouldRetry || attempt.retriesLeft <= 0) return
      const retryMaxAttempts = resolveRetryMaxAttempts(request, attempt.error)
      const message =
        attempt.error instanceof Error
          ? attempt.error.message
          : String(attempt.error)
      console.warn(
        `[provider:opencode] transient failure, retry ${attempt.attemptNumber}/${retryMaxAttempts}: ${message}`,
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
  try {
    ensureOpencodePreflight()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const normalizedMessage = message.startsWith('[provider:opencode]')
      ? message
      : `[provider:opencode] preflight failed: ${message}`
    throw new ProviderError({
      code: 'provider_preflight_failed',
      message: normalizedMessage,
      retryable: false,
    })
  }
  try {
    return await opencodeBreaker.fire(request)
  } catch (error) {
    if (error instanceof ProviderError) throw error
    if (isAbortLikeError(error)) {
      throw new ProviderError({
        code: 'provider_aborted',
        message: '[provider:opencode] aborted',
        retryable: false,
      })
    }
    if (error instanceof Error && /breaker is open/i.test(error.message)) {
      throw new ProviderError({
        code: 'provider_circuit_open',
        message:
          '[provider:opencode] circuit is open due to consecutive failures',
        retryable: false,
      })
    }
    throw error
  }
}
export const opencodeProvider: Provider<OpencodeProviderRequest> = {
  id: 'opencode',
  run: runOpencode,
}
