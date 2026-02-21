import { buildManagerPrompt } from '../prompts/build-prompts.js'
import { runWithProvider } from '../providers/registry.js'
import {
  appendTraceArchiveResult,
  type TraceArchiveResult,
} from '../storage/traces-archive.js'

import {
  enforcePromptBudget,
  resolveManagerTimeoutMs,
  toError,
} from './runner-budget.js'

import type {
  CronJob,
  HistoryLookupMessage,
  ManagerActionFeedback,
  ManagerEnv,
  Task,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export const runManager = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  cronJobs?: CronJob[]
  historyLookup?: HistoryLookupMessage[]
  actionFeedback?: ManagerActionFeedback[]
  compressedContext?: string
  env?: ManagerEnv
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  sessionId?: string
  maxPromptTokens?: number
  onTextDelta?: (delta: string) => void
  onUsage?: (usage: TokenUsage) => void
  onStreamReset?: () => void
}): Promise<{
  output: string
  elapsedMs: number
  sessionId?: string
  usage?: TokenUsage
}> => {
  const prompt = await buildManagerPrompt({
    stateDir: params.stateDir,
    workDir: params.workDir,
    inputs: params.inputs,
    results: params.results,
    tasks: params.tasks,
    ...(params.cronJobs ? { cronJobs: params.cronJobs } : {}),
    ...(params.historyLookup ? { historyLookup: params.historyLookup } : {}),
    ...(params.actionFeedback ? { actionFeedback: params.actionFeedback } : {}),
    ...(params.compressedContext
      ? { compressedContext: params.compressedContext }
      : {}),
    ...(params.env ? { env: params.env } : {}),
  })
  const model = params.model?.trim()
  const budgetedPrompt = enforcePromptBudget(prompt, params.maxPromptTokens)
  const timeoutMs = resolveManagerTimeoutMs(budgetedPrompt.prompt)

  const archive = (
    threadId: string | null | undefined,
    data: TraceArchiveResult,
  ) =>
    appendTraceArchiveResult(
      params.stateDir,
      {
        role: 'manager',
        ...(model ? { model } : {}),
        ...(threadId ? { threadId } : {}),
        attempt: 'primary',
      },
      budgetedPrompt.prompt,
      data,
    )

  const callProvider = (threadId?: string) =>
    runWithProvider({
      provider: 'codex-sdk',
      role: 'manager',
      prompt: budgetedPrompt.prompt,
      workDir: params.workDir,
      timeoutMs,
      ...(model ? { model } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
      ...(threadId ? { threadId } : {}),
      ...(params.onTextDelta ? { onTextDelta: params.onTextDelta } : {}),
      ...(params.onUsage ? { onUsage: params.onUsage } : {}),
    })

  try {
    let result
    try {
      result = await callProvider(params.sessionId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const invalidSession =
        /session|thread/i.test(message) &&
        /not found|404|unknown/i.test(message)
      if (!params.sessionId || !invalidSession) throw error
      params.onStreamReset?.()
      result = await callProvider()
    }

    await archive(result.threadId ?? undefined, { ...result, ok: true })
    return {
      output: result.output,
      elapsedMs: result.elapsedMs,
      ...(result.threadId ? { sessionId: result.threadId } : {}),
      ...(result.usage ? { usage: result.usage } : {}),
    }
  } catch (error) {
    const err = toError(error)
    await archive(params.sessionId, {
      output: '',
      ok: false,
      error: err.message,
      errorName: err.name,
    })
    throw error
  }
}
