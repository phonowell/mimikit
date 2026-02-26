import { Codex } from '@openai/codex-sdk'

import { logSafeError } from '../log/safe.js'

import {
  HARDCODED_MODEL_REASONING_EFFORT,
  loadCodexSettings,
} from './openai-settings.js'
import {
  ProviderError,
  readProviderErrorCode,
} from './provider-error.js'
import {
  bindExternalAbort,
  buildProviderResult,
  createTimeoutGuard,
  elapsedMsSince,
} from './provider-runtime.js'
import { runCodexStream } from './codex-stream.js'
import {
  appendCodexLlmLog,
  buildCodexProviderError,
  createCodexThread,
} from './codex-sdk-provider-helpers.js'

import type { CodexSdkProviderRequest, Provider } from './types.js'

const codex = new Codex()

const runCodexProvider = async (request: CodexSdkProviderRequest) => {
  if (request.logPath) {
    try {
      const settings = await loadCodexSettings()
      await appendCodexLlmLog(request, {
        event: 'llm_call_started',
        ...(settings.model ? { modelResolved: settings.model } : {}),
        ...(settings.baseUrl ? { baseUrl: settings.baseUrl } : {}),
        ...(settings.wireApi ? { wireApi: settings.wireApi } : {}),
        ...(settings.requiresOpenAiAuth !== undefined
          ? { requiresOpenAiAuth: settings.requiresOpenAiAuth }
          : {}),
        modelReasoningEffort:
          request.modelReasoningEffort ?? HARDCODED_MODEL_REASONING_EFFORT,
        apiKeyPresent: Boolean(settings.apiKey ?? process.env.OPENAI_API_KEY),
      })
    } catch (error) {
      await logSafeError('provider:codex-sdk loadCodexSettings', error, {
        logPath: request.logPath,
      })
      await appendCodexLlmLog(request, { event: 'llm_call_started' })
    }
  }

  const { thread } = createCodexThread(codex, request)

  const startedAt = Date.now()
  const controller = new AbortController()
  let lastActivityAt = startedAt
  let externallyAborted = false
  let timedOut = false
  const releaseExternalAbort = bindExternalAbort({
    controller,
    ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
    onAbort: () => {
      externallyAborted = true
    },
  })
  const idleTimeout = createTimeoutGuard({
    controller,
    timeoutMs: request.timeoutMs,
    onTimeout: () => {
      timedOut = true
    },
  })

  const resetIdle = () => {
    lastActivityAt = Date.now()
    idleTimeout.arm()
  }

  try {
    resetIdle()
    const { output, usage } = await runCodexStream(
      thread,
      request,
      controller.signal,
      resetIdle,
    )
    const elapsedMs = elapsedMsSince(startedAt)
    await appendCodexLlmLog(request, {
      event: 'llm_call_finished',
      elapsedMs,
      ...(usage ? { usage } : {}),
      idleTimeoutMs: request.timeoutMs,
      timeoutType: 'idle',
    })
    return buildProviderResult({
      startedAt,
      output,
      ...(usage ? { usage } : {}),
      threadId: thread.id ?? request.threadId ?? null,
    })
  } catch (error) {
    const elapsedMs = elapsedMsSince(startedAt)
    const err = error instanceof Error ? error : new Error(String(error))
    const mappedError =
      err instanceof ProviderError
        ? err
        : buildCodexProviderError({
            error: err,
            timeoutMs: request.timeoutMs,
            timedOut,
            externallyAborted,
          })
    const errorCode = readProviderErrorCode(mappedError)
    await appendCodexLlmLog(request, {
      event: 'llm_call_failed',
      elapsedMs,
      error: mappedError.message,
      errorName: mappedError.name,
      ...(errorCode ? { errorCode } : {}),
      aborted: errorCode === 'provider_aborted',
      idleElapsedMs: Math.max(0, Date.now() - lastActivityAt),
      idleTimeoutMs: request.timeoutMs,
      timeoutType: 'idle',
    })
    throw mappedError
  } finally {
    idleTimeout.clear()
    releaseExternalAbort()
  }
}

export const codexSdkProvider: Provider<CodexSdkProviderRequest> = {
  id: 'codex-sdk',
  run: runCodexProvider,
}
