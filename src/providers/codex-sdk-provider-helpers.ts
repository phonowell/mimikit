import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'

import { HARDCODED_MODEL_REASONING_EFFORT } from './openai-settings.js'
import {
  buildProviderAbortedError,
  buildProviderSdkError,
  buildProviderTimeoutError,
  isTransientProviderMessage,
} from './provider-error.js'

import type { Codex } from '@openai/codex-sdk'
import type { ProviderError } from './provider-error.js'
import type { CodexSdkProviderRequest } from './types.js'

export const approvalPolicy = 'never' as const

export const sandboxModeFor = (
  role: CodexSdkProviderRequest['role'],
): 'danger-full-access' | 'read-only' =>
  role === 'worker' ? 'danger-full-access' : 'read-only'

const toLogContext = (
  request: CodexSdkProviderRequest,
): Record<string, unknown> => ({
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
})

export const appendCodexLlmLog = async (
  request: CodexSdkProviderRequest,
  entry: Record<string, unknown>,
): Promise<void> => {
  if (!request.logPath) return
  const context = toLogContext(request)
  await bestEffort('appendLog: llm_call', () =>
    appendLog(request.logPath as string, { ...entry, ...context }),
  )
}

export const buildCodexProviderError = (params: {
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

export const createCodexThread = (
  codex: Codex,
  request: CodexSdkProviderRequest,
) => {
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
  return { thread, modelReasoningEffort }
}
