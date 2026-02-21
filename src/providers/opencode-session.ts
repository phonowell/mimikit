import { createOpencodeClient } from '@opencode-ai/sdk/v2'

import {
  ensureOpencodePreflight,
  getSharedOpencodeServer,
  isAbortLikeError,
  isOpencodeServerFailure,
  resetSharedOpencodeServer,
  resolveServerTimeout,
} from './opencode-provider-bootstrap.js'
import { resolveOpencodeModelRef } from './opencode-provider-utils.js'
import {
  buildProviderAbortedError,
  buildProviderPreflightError,
  buildProviderSdkError,
  buildProviderTimeoutError,
  isTransientProviderMessage,
  readProviderErrorCode,
} from './provider-error.js'
import {
  bindExternalAbort,
  createProviderLifecycle,
  createTimeoutGuard,
} from './provider-runtime.js'

const SUMMARIZE_MAX_ATTEMPTS = 2

export const summarizeOpencodeSession = async (params: {
  workDir: string
  sessionId: string
  timeoutMs: number
  model?: string
  abortSignal?: AbortSignal
}): Promise<void> => {
  try {
    ensureOpencodePreflight()
  } catch (error) {
    throw buildProviderPreflightError({
      providerId: 'opencode',
      message: error instanceof Error ? error.message : String(error),
    })
  }
  for (
    let attemptNumber = 1;
    attemptNumber <= SUMMARIZE_MAX_ATTEMPTS;
    attemptNumber += 1
  ) {
    try {
      const controller = new AbortController()
      const lifecycle = createProviderLifecycle()
      const releaseExternalAbort = bindExternalAbort({
        controller,
        ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
        onAbort: () => {
          lifecycle.externallyAborted = true
        },
      })
      const timeoutGuard = createTimeoutGuard({
        controller,
        timeoutMs: params.timeoutMs,
        onTimeout: () => {
          lifecycle.timedOut = true
        },
      })
      timeoutGuard.arm()
      try {
        const model = resolveOpencodeModelRef(params.model)
        const server = await getSharedOpencodeServer(
          resolveServerTimeout(params.timeoutMs),
        )
        const client = createOpencodeClient({ baseUrl: server.url })
        await client.session.summarize(
          {
            sessionID: params.sessionId,
            directory: params.workDir,
            providerID: model.providerID,
            modelID: model.modelID,
            auto: true,
          },
          {
            signal: controller.signal,
            responseStyle: 'data',
            throwOnError: true,
          },
        )
      } catch (error) {
        if (lifecycle.timedOut)
          throw buildProviderTimeoutError('opencode', params.timeoutMs)
        if (lifecycle.externallyAborted || controller.signal.aborted)
          throw buildProviderAbortedError('opencode')
        if (isAbortLikeError(error)) throw buildProviderAbortedError('opencode')
        if (isOpencodeServerFailure(error)) resetSharedOpencodeServer()
        throw buildProviderSdkError({
          providerId: 'opencode',
          message: error instanceof Error ? error.message : String(error),
          transient: isTransientProviderMessage(
            error instanceof Error ? error.message : String(error),
          ),
        })
      } finally {
        timeoutGuard.clear()
        releaseExternalAbort()
      }
      return
    } catch (error) {
      const code = readProviderErrorCode(error)
      const retryable =
        code === 'provider_aborted' ||
        code === 'provider_timeout' ||
        code === 'provider_transient_network'
      if (
        attemptNumber >= SUMMARIZE_MAX_ATTEMPTS ||
        !retryable ||
        params.abortSignal?.aborted
      )
        throw error
    }
  }
}
