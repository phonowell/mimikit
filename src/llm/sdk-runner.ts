import { Codex } from '@openai/codex-sdk'

import { appendLog } from '../log/append.js'
import { bestEffort, logSafeError } from '../log/safe.js'
import { normalizeUsage } from '../shared/utils.js'

import {
  HARDCODED_MODEL_REASONING_EFFORT,
  loadCodexSettings,
} from './openai.js'

import type { TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

type RunResult = {
  output: string
  usage?: TokenUsage
  elapsedMs: number
  threadId?: string | null
}
type LogContext = Record<string, unknown>
type RunParams = {
  role: 'thinker' | 'worker'
  prompt: string
  workDir: string
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  timeoutMs: number
  threadId?: string | null
  outputSchema?: unknown
  logPath?: string
  logContext?: LogContext
  abortSignal?: AbortSignal
}

const codex = new Codex()
const approvalPolicy = 'never' as const

export const runCodexSdk = async (params: RunParams): Promise<RunResult> => {
  const sandboxMode =
    params.role === 'worker'
      ? ('danger-full-access' as const)
      : ('read-only' as const)
  const modelReasoningEffort =
    params.modelReasoningEffort ?? HARDCODED_MODEL_REASONING_EFFORT
  const baseContext: LogContext = {
    role: params.role,
    timeoutMs: params.timeoutMs,
    idleTimeoutMs: params.timeoutMs,
    timeoutType: 'idle',
    promptChars: params.prompt.length,
    promptLines: params.prompt.split(/\r?\n/).length,
    outputSchema: Boolean(params.outputSchema),
    workingDirectory: params.workDir,
    sandboxMode,
    approvalPolicy,
    ...(params.model ? { model: params.model } : {}),
    ...(params.logContext ?? {}),
  }
  const append = params.logPath
    ? (entry: LogContext) =>
        bestEffort('appendLog: llm_call', () =>
          appendLog(params.logPath as string, { ...entry, ...baseContext }),
        )
    : (_entry: LogContext) => Promise.resolve()

  if (params.logPath) {
    try {
      const settings = await loadCodexSettings()
      await append({
        event: 'llm_call_started',
        ...(settings.model ? { modelResolved: settings.model } : {}),
        ...(settings.baseUrl ? { baseUrl: settings.baseUrl } : {}),
        ...(settings.wireApi ? { wireApi: settings.wireApi } : {}),
        ...(settings.requiresOpenAiAuth !== undefined
          ? { requiresOpenAiAuth: settings.requiresOpenAiAuth }
          : {}),
        modelReasoningEffort,
        apiKeyPresent: Boolean(settings.apiKey ?? process.env.OPENAI_API_KEY),
      })
    } catch (error) {
      await logSafeError('runCodexSdk: loadCodexSettings', error, {
        logPath: params.logPath,
      })
      await append({ event: 'llm_call_started' })
    }
  }

  const threadOptions = {
    workingDirectory: params.workDir,
    ...(params.model ? { model: params.model } : {}),
    modelReasoningEffort,
    sandboxMode,
    approvalPolicy,
  }
  const thread = params.threadId
    ? codex.resumeThread(params.threadId, threadOptions)
    : codex.startThread(threadOptions)

  const controller =
    params.timeoutMs > 0 || params.abortSignal ? new AbortController() : null
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const startedAt = Date.now()
  let lastActivityAt = startedAt
  const onExternalAbort = () => {
    if (controller && !controller.signal.aborted) controller.abort()
  }
  const resetIdle = () => {
    lastActivityAt = Date.now()
    if (!controller || params.timeoutMs <= 0) return
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => controller.abort(), params.timeoutMs)
  }

  if (params.abortSignal) {
    if (params.abortSignal.aborted) onExternalAbort()
    else params.abortSignal.addEventListener('abort', onExternalAbort)
  }

  try {
    resetIdle()
    const stream = await thread.runStreamed(params.prompt, {
      ...(params.outputSchema ? { outputSchema: params.outputSchema } : {}),
      ...(controller ? { signal: controller.signal } : {}),
    })
    let output = ''
    let usage: TokenUsage | undefined
    for await (const event of stream.events) {
      resetIdle()
      if (event.type === 'item.completed') {
        if (event.item.type === 'agent_message') output = event.item.text
        continue
      }
      if (event.type === 'turn.completed') {
        usage = normalizeUsage(event.usage)
        continue
      }
      if (event.type === 'turn.failed') throw new Error(event.error.message)
      if (event.type === 'error') throw new Error(event.message)
    }
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    await append({
      event: 'llm_call_finished',
      elapsedMs,
      ...(usage ? { usage } : {}),
      idleTimeoutMs: params.timeoutMs,
      timeoutType: 'idle',
    })
    return {
      output,
      elapsedMs,
      ...(usage ? { usage } : {}),
      threadId: thread.id ?? params.threadId ?? null,
    }
  } catch (error) {
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    const err = error instanceof Error ? error : new Error(String(error))
    await append({
      event: 'llm_call_failed',
      elapsedMs,
      error: err.message,
      errorName: err.name,
      aborted: err.name === 'AbortError' || /aborted/i.test(err.message),
      idleElapsedMs: Math.max(0, Date.now() - lastActivityAt),
      idleTimeoutMs: params.timeoutMs,
      timeoutType: 'idle',
    })
    throw error
  } finally {
    clearTimeout(idleTimer)
    if (params.abortSignal)
      params.abortSignal.removeEventListener('abort', onExternalAbort)
  }
}
