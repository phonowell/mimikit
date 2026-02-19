import { Codex } from '@openai/codex-sdk'

import { appendLog } from '../log/append.js'
import { bestEffort, logSafeError } from '../log/safe.js'
import { normalizeUsage } from '../shared/utils.js'

import {
  HARDCODED_MODEL_REASONING_EFFORT,
  loadCodexSettings,
} from './openai-settings.js'
import {
  isTransientProviderMessage,
  ProviderError,
  readProviderErrorCode,
} from './provider-error.js'
import {
  bindExternalAbort,
  buildProviderResult,
  createTimeoutGuard,
  elapsedMsSince,
} from './provider-runtime.js'

import type { CodexSdkProviderRequest, Provider } from './types.js'

const codex = new Codex()
const approvalPolicy = 'never' as const

const buildCodexProviderError = (params: {
  error: Error
  timeoutMs: number
  timedOut: boolean
  externallyAborted: boolean
}): ProviderError => {
  const { error, timeoutMs, timedOut, externallyAborted } = params
  if (timedOut) {
    return new ProviderError({
      code: 'provider_timeout',
      message: `[provider:codex-sdk] timed out after ${timeoutMs}ms`,
      retryable: true,
    })
  }
  if (
    externallyAborted ||
    error.name === 'AbortError' ||
    /aborted|canceled/i.test(error.message)
  ) {
    return new ProviderError({
      code: 'provider_aborted',
      message: '[provider:codex-sdk] aborted',
      retryable: false,
    })
  }
  const message = error.message.trim()
  const normalizedMessage = message.startsWith('[provider:codex-sdk]')
    ? message
    : `[provider:codex-sdk] sdk run failed: ${message}`
  if (isTransientProviderMessage(message)) {
    return new ProviderError({
      code: 'provider_transient_network',
      message: normalizedMessage,
      retryable: true,
    })
  }
  return new ProviderError({
    code: 'provider_sdk_failure',
    message: normalizedMessage,
    retryable: false,
  })
}

const toLogContext = (
  request: CodexSdkProviderRequest,
): Record<string, unknown> => {
  const sandboxMode =
    request.role === 'worker'
      ? ('danger-full-access' as const)
      : ('read-only' as const)
  return {
    role: request.role,
    timeoutMs: request.timeoutMs,
    idleTimeoutMs: request.timeoutMs,
    timeoutType: 'idle',
    promptChars: request.prompt.length,
    promptLines: request.prompt.split(/\r?\n/).length,
    outputSchema: Boolean(request.outputSchema),
    workingDirectory: request.workDir,
    sandboxMode,
    approvalPolicy,
    ...(request.model ? { model: request.model } : {}),
    ...(request.logContext ?? {}),
  }
}

const appendLlmLog = async (
  request: CodexSdkProviderRequest,
  entry: Record<string, unknown>,
): Promise<void> => {
  if (!request.logPath) return
  const context = toLogContext(request)
  await bestEffort('appendLog: llm_call', () =>
    appendLog(request.logPath as string, { ...entry, ...context }),
  )
}

const createThread = (request: CodexSdkProviderRequest) => {
  const sandboxMode =
    request.role === 'worker'
      ? ('danger-full-access' as const)
      : ('read-only' as const)
  const modelReasoningEffort =
    request.modelReasoningEffort ?? HARDCODED_MODEL_REASONING_EFFORT
  const threadOptions = {
    workingDirectory: request.workDir,
    ...(request.model ? { model: request.model } : {}),
    modelReasoningEffort,
    sandboxMode,
    approvalPolicy,
  }
  const thread = request.threadId
    ? codex.resumeThread(request.threadId, threadOptions)
    : codex.startThread(threadOptions)
  return { thread }
}

const runCodexProvider = async (request: CodexSdkProviderRequest) => {
  if (request.logPath) {
    try {
      const settings = await loadCodexSettings()
      await appendLlmLog(request, {
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
      await appendLlmLog(request, { event: 'llm_call_started' })
    }
  }

  const { thread } = createThread(request)

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
    const stream = await thread.runStreamed(request.prompt, {
      ...(request.outputSchema ? { outputSchema: request.outputSchema } : {}),
      signal: controller.signal,
    })
    let output = ''
    let usage: ReturnType<typeof normalizeUsage> | undefined
    for await (const event of stream.events) {
      resetIdle()
      if (event.type === 'item.completed') {
        if (event.item.type === 'agent_message') output = event.item.text
        continue
      }
      if (event.type === 'turn.completed') {
        usage = normalizeUsage(event.usage)
        if (usage) request.onUsage?.(usage)
        continue
      }
      if (event.type === 'turn.failed') throw new Error(event.error.message)
      if (event.type === 'error') throw new Error(event.message)
    }
    const elapsedMs = elapsedMsSince(startedAt)
    await appendLlmLog(request, {
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
    await appendLlmLog(request, {
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
