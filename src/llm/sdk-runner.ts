import { Codex } from '@openai/codex-sdk'

import { appendLog } from '../log/append.js'
import { logSafeError, safe } from '../log/safe.js'
import { normalizeUsage } from '../shared/utils.js'

import { createIdleAbort } from './idle-abort.js'
import { loadCodexSettings } from './openai.js'

import type { TokenUsage } from '../types/index.js'

type SdkRole = 'manager' | 'worker'
type RunResult = {
  output: string
  usage?: TokenUsage
  elapsedMs: number
  threadId?: string | null
}
type LogContext = Record<string, unknown>

const codex = new Codex()

export const runCodexSdk = async (params: {
  role: SdkRole
  prompt: string
  workDir: string
  model?: string
  timeoutMs: number
  threadId?: string | null
  outputSchema?: unknown
  logPath?: string
  logContext?: LogContext
  abortSignal?: AbortSignal
}): Promise<RunResult> => {
  const promptChars = params.prompt.length
  const promptLines = params.prompt.split(/\r?\n/).length
  const { logPath } = params
  const sandboxMode =
    params.role === 'worker'
      ? ('danger-full-access' as const)
      : ('read-only' as const)
  const approvalPolicy = 'never' as const
  const baseContext: LogContext = {
    role: params.role,
    timeoutMs: params.timeoutMs,
    idleTimeoutMs: params.timeoutMs,
    timeoutType: 'idle',
    promptChars,
    promptLines,
    outputSchema: !!params.outputSchema,
    workingDirectory: params.workDir,
    sandboxMode,
    approvalPolicy,
    ...(params.model ? { model: params.model } : {}),
    ...(params.logContext ?? {}),
  }
  const append = logPath
    ? (entry: LogContext) =>
        safe(
          'appendLog: llm_call',
          () => appendLog(logPath, { ...entry, ...baseContext }),
          { fallback: undefined },
        )
    : () => Promise.resolve()

  if (logPath) {
    try {
      const settings = await loadCodexSettings()
      const modelResolved = settings.model ?? process.env.OPENAI_MODEL
      const baseUrl = settings.baseUrl ?? process.env.OPENAI_BASE_URL
      const wireApi = settings.wireApi ?? process.env.OPENAI_WIRE_API
      const apiKeyPresent = Boolean(
        settings.apiKey ?? process.env.OPENAI_API_KEY,
      )
      await append({
        event: 'llm_call_started',
        ...(modelResolved ? { modelResolved } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        ...(wireApi ? { wireApi } : {}),
        ...(settings.requiresOpenAiAuth !== undefined
          ? { requiresOpenAiAuth: settings.requiresOpenAiAuth }
          : {}),
        ...(settings.modelReasoningEffort
          ? { modelReasoningEffort: settings.modelReasoningEffort }
          : {}),
        apiKeyPresent,
      })
    } catch (error) {
      await logSafeError('runCodexSdk: loadCodexSettings', error, { logPath })
      await append({ event: 'llm_call_started' })
    }
  }

  const threadOptions = {
    workingDirectory: params.workDir,
    ...(params.model ? { model: params.model } : {}),
    sandboxMode,
    approvalPolicy,
  }

  const thread = params.threadId
    ? codex.resumeThread(params.threadId, threadOptions)
    : codex.startThread(threadOptions)

  const idleTimeoutMs = params.timeoutMs
  const idle = createIdleAbort({
    timeoutMs: idleTimeoutMs,
    ...(params.abortSignal ? { externalSignal: params.abortSignal } : {}),
    ...(logPath
      ? {
          onAbort: () => {
            const now = Date.now()
            void append({
              event: 'llm_call_aborted',
              elapsedMs: Math.max(0, now - idle.startedAt),
              idleElapsedMs: Math.max(0, now - idle.lastActivityAt()),
              idleTimeoutMs,
              timeoutType: 'idle',
            })
          },
        }
      : {}),
  })

  try {
    idle.reset()
    const stream = await thread.runStreamed(params.prompt, {
      ...(params.outputSchema ? { outputSchema: params.outputSchema } : {}),
      ...(idle.signal ? { signal: idle.signal } : {}),
    })
    let finalResponse = ''
    let usage: TokenUsage | undefined
    let turnFailure: { message: string } | null = null
    for await (const event of stream.events) {
      idle.reset()
      if (event.type === 'item.completed') {
        if (event.item.type === 'agent_message') finalResponse = event.item.text
      } else if (event.type === 'turn.completed')
        usage = normalizeUsage(event.usage)
      else if (event.type === 'turn.failed') {
        turnFailure = event.error
        break
      } else if (event.type === 'error') {
        turnFailure = { message: event.message }
        break
      }
    }
    if (turnFailure) throw new Error(turnFailure.message)
    const elapsedMs = Math.max(0, Date.now() - idle.startedAt)
    await append({
      event: 'llm_call_finished',
      elapsedMs,
      ...(usage ? { usage } : {}),
      idleTimeoutMs,
      timeoutType: 'idle',
    })
    return {
      output: finalResponse,
      elapsedMs,
      ...(usage ? { usage } : {}),
      threadId: thread.id ?? params.threadId ?? null,
    }
  } catch (error) {
    const elapsedMs = Math.max(0, Date.now() - idle.startedAt)
    const err = error instanceof Error ? error : new Error(String(error))
    const trimmedStack = err.stack
      ? err.stack.split(/\r?\n/).slice(0, 6).join('\n')
      : undefined
    await append({
      event: 'llm_call_failed',
      elapsedMs,
      error: err.message,
      errorName: err.name,
      ...(trimmedStack ? { errorStack: trimmedStack } : {}),
      aborted: err.name === 'AbortError' || /aborted/i.test(err.message),
      idleTimeoutMs,
      timeoutType: 'idle',
    })
    throw error
  } finally {
    idle.dispose()
  }
}
