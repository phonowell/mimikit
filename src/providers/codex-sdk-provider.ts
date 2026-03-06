import { Codex } from '@openai/codex-sdk'

import { logSafeError } from '../log/safe.js'
import { attachProviderThreadId } from '../shared/provider-thread-id.js'

import {
  appendCodexLlmLog,
  buildCodexProviderError,
  createCodexThread,
} from './codex-sdk-provider-helpers.js'
import {
  DEFAULT_MODEL_REASONING_EFFORT,
  loadCodexSettings,
} from './codex-settings.js'
import { runCodexStream } from './codex-stream.js'
import { ProviderError, readProviderErrorCode } from './provider-error.js'
import {
  bindExternalAbort,
  buildProviderResult,
  createTimeoutGuard,
  elapsedMsSince,
} from './provider-runtime.js'

import type { CodexSdkProviderRequest, Provider } from './types.js'

const codexClientCache = new Map<string, Codex>()

const toCodexCliEnv = (proxy: string): Record<string, string> => {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value
  }
  env.HTTP_PROXY = proxy
  env.HTTPS_PROXY = proxy
  env.ALL_PROXY = proxy
  env.http_proxy = proxy
  env.https_proxy = proxy
  env.all_proxy = proxy
  return env
}

const resolveCodexProxy = (proxy: string | undefined): string | undefined => {
  const trimmed = proxy?.trim()
  if (!trimmed) return undefined
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      throw new Error('invalid_protocol')
    return parsed.toString()
  } catch {
    throw new Error(`worker_proxy_invalid_url:${trimmed}`)
  }
}

const resolveCodexClient = (proxy: string | undefined): Codex => {
  const proxyUrl = resolveCodexProxy(proxy)
  const key = proxyUrl ?? ''
  const cached = codexClientCache.get(key)
  if (cached) return cached
  const client = proxyUrl
    ? new Codex({ env: toCodexCliEnv(proxyUrl) })
    : new Codex()
  codexClientCache.set(key, client)
  return client
}

const runCodexProvider = async (request: CodexSdkProviderRequest) => {
  if (request.logPath) {
    try {
      const settings = await loadCodexSettings()
      await appendCodexLlmLog(request, {
        event: 'llm_call_started',
        ...(settings.model ? { modelResolved: settings.model } : {}),
        ...(settings.baseUrl ? { baseUrl: settings.baseUrl } : {}),
        ...(settings.wireApi ? { wireApi: settings.wireApi } : {}),
        ...(settings.requiresAuth !== undefined
          ? { requiresAuth: settings.requiresAuth }
          : {}),
        modelReasoningEffort:
          request.modelReasoningEffort ?? DEFAULT_MODEL_REASONING_EFFORT,
        apiKeyPresent: Boolean(settings.apiKey ?? process.env.OPENAI_API_KEY),
      })
    } catch (error) {
      await logSafeError('provider:codex-sdk loadCodexSettings', error, {
        logPath: request.logPath,
      })
      await appendCodexLlmLog(request, { event: 'llm_call_started' })
    }
  }

  const codex = resolveCodexClient(request.proxy)
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
    throw attachProviderThreadId(
      mappedError,
      thread.id ?? request.threadId ?? null,
    )
  } finally {
    idleTimeout.clear()
    releaseExternalAbort()
  }
}

export const codexSdkProvider: Provider<CodexSdkProviderRequest> = {
  id: 'codex-sdk',
  run: runCodexProvider,
}
