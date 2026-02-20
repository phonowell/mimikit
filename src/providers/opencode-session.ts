import { createOpencodeClient } from '@opencode-ai/sdk/v2'

import {
  ensureOpencodePreflight,
  isAbortLikeError,
  resolveServerTimeout,
  startOpencodeServer,
} from './opencode-provider-bootstrap.js'
import {
  buildProviderAbortedError,
  buildProviderPreflightError,
  buildProviderSdkError,
  buildProviderTimeoutError,
  isTransientProviderMessage,
} from './provider-error.js'
import {
  bindExternalAbort,
  createProviderLifecycle,
  createTimeoutGuard,
} from './provider-runtime.js'

export const summarizeOpencodeSession = async (params: {
  workDir: string
  sessionId: string
  timeoutMs: number
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
  let closeServer: (() => void) | undefined
  try {
    const server = await startOpencodeServer(
      controller.signal,
      resolveServerTimeout(params.timeoutMs),
    )
    closeServer = server.close
    const client = createOpencodeClient({ baseUrl: server.url })
    await client.session.summarize(
      {
        sessionID: params.sessionId,
        directory: params.workDir,
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
    if (closeServer) closeServer()
  }
}
