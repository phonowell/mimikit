import { Codex } from '@openai/codex-sdk'

import { appendLog } from '../log/append.js'
import { bestEffort, logSafeError } from '../log/safe.js'
import { normalizeUsage } from '../shared/utils.js'

import {
  HARDCODED_MODEL_REASONING_EFFORT,
  loadCodexSettings,
} from './openai-settings.js'
import {
  buildProviderAbortedError,
  buildProviderSdkError,
  buildProviderTimeoutError,
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
  if (timedOut) return buildProviderTimeoutError('codex-sdk', timeoutMs)
  if (
    externallyAborted ||
    error.name === 'AbortError' ||
    /aborted|canceled/i.test(error.message)
  )
    return buildProviderAbortedError('codex-sdk')
  return buildProviderSdkError({
    providerId: 'codex-sdk',
    message: error.message,
    transient: isTransientProviderMessage(error.message),
  })
}

const sandboxModeFor = (role: string) =>
  role === 'worker' ? ('danger-full-access' as const) : ('read-only' as const)

const toLogContext = (
  request: CodexSdkProviderRequest,
): Record<string, unknown> => {
  return {
    role: request.role,
    timeoutMs: request.timeoutMs,
    idleTimeoutMs: request.timeoutMs,
    timeoutType: 'idle',
    promptChars: request.prompt.length,
    promptLines: request.prompt.split(/\r?\n/).length,
    outputSchema: Boolean(request.outputSchema),
    workingDirectory: request.workDir,
    sandboxMode: sandboxModeFor(request.role),
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
  const modelReasoningEffort =
    request.modelReasoningEffort ?? HARDCODED_MODEL_REASONING_EFFORT
  const threadOptions = {
    workingDirectory: request.workDir,
    ...(request.model ? { model: request.model } : {}),
    modelReasoningEffort,
    sandboxMode: sandboxModeFor(request.role),
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
    let streamedOutput = ''
    let usage: ReturnType<typeof normalizeUsage> | undefined
    for await (const event of stream.events) {
      resetIdle()
      if (event.type === 'item.updated' || event.type === 'item.completed') {
        if (event.item.type !== 'agent_message') continue
        const nextOutput = event.item.text
        if (request.onTextDelta) {
          const delta = nextOutput.startsWith(streamedOutput)
            ? nextOutput.slice(streamedOutput.length)
            : nextOutput
          if (delta) request.onTextDelta(delta)
        }
        streamedOutput = nextOutput
        if (event.type === 'item.completed') output = nextOutput
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
