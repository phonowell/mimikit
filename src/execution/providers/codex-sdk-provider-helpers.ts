import { DEFAULT_MODEL_REASONING_EFFORT } from './codex-settings.js'
import { appendLog } from './log.js'
import {
  buildProviderAbortedError,
  buildProviderSdkError,
  buildProviderTimeoutError,
  isTransientProviderMessage,
} from './provider-error.js'
import { bestEffort } from './safe.js'

import type { ProviderError } from './provider-error.js'
import type { CodexSdkProviderRequest } from './types.js'
import type { Codex } from '@openai/codex-sdk'

export const approvalPolicy = 'never' as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const normalizeCodexOutputSchema = (
  outputSchema: unknown,
): unknown | undefined => {
  if (!isRecord(outputSchema)) return outputSchema
  if (outputSchema.type !== 'json_schema') return outputSchema
  return isRecord(outputSchema.schema) ? outputSchema.schema : outputSchema
}

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
    /aborted|canceled|cancelled/i.test(error.message)
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
    request.modelReasoningEffort ?? DEFAULT_MODEL_REASONING_EFFORT
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
