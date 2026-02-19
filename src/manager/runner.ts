import { buildManagerPrompt } from '../prompts/build-prompts.js'
import { runWithProvider } from '../providers/registry.js'
import {
  appendTraceArchiveResult,
  type TraceArchiveEntry,
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

export const runManager = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  cronJobs?: CronJob[]
  historyLookup?: HistoryLookupMessage[]
  actionFeedback?: ManagerActionFeedback[]
  env?: ManagerEnv
  model?: string
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
    ...(params.env ? { env: params.env } : {}),
  })
  const model = params.model?.trim()
  const budgetedPrompt = enforcePromptBudget(prompt, params.maxPromptTokens)
  const timeoutMs = resolveManagerTimeoutMs(budgetedPrompt.prompt)

  type ArchiveBase = Omit<TraceArchiveEntry, 'prompt' | 'output' | 'ok'>
  const archive = (base: ArchiveBase, result: TraceArchiveResult) =>
    appendTraceArchiveResult(
      params.stateDir,
      base,
      budgetedPrompt.prompt,
      result,
    )

  const archiveBase = (
    callModel: string | undefined,
    sessionId?: string,
  ): ArchiveBase => ({
    role: 'manager',
    ...(callModel ? { model: callModel } : {}),
    ...(sessionId ? { threadId: sessionId } : {}),
    attempt: 'primary',
  })

  const isInvalidSessionError = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error)
    return /session/i.test(message) && /not found|404|unknown/i.test(message)
  }

  const callProvider = (callModel: string | undefined, sessionId?: string) =>
    runWithProvider({
      provider: 'opencode',
      role: 'manager',
      prompt: budgetedPrompt.prompt,
      workDir: params.workDir,
      timeoutMs,
      ...(callModel ? { model: callModel } : {}),
      ...(sessionId ? { threadId: sessionId } : {}),
      ...(params.onTextDelta ? { onTextDelta: params.onTextDelta } : {}),
      ...(params.onUsage ? { onUsage: params.onUsage } : {}),
    })

  const toResult = (r: {
    output: string
    elapsedMs: number
    usage?: TokenUsage
    threadId?: string | null
  }) => ({
    output: r.output,
    elapsedMs: r.elapsedMs,
    ...(r.threadId ? { sessionId: r.threadId } : {}),
    ...(r.usage ? { usage: r.usage } : {}),
  })

  const callWithSessionRecovery = async (
    callModel: string | undefined,
    sessionId: string | undefined,
  ) => {
    try {
      const r = await callProvider(callModel, sessionId)
      await archive(archiveBase(callModel, r.threadId ?? undefined), {
        ...r,
        ok: true,
      })
      return r
    } catch (error) {
      if (!sessionId || !isInvalidSessionError(error)) throw error
      params.onStreamReset?.()
      const recovered = await callProvider(callModel)
      await archive(archiveBase(callModel, recovered.threadId ?? undefined), {
        ...recovered,
        ok: true,
      })
      return recovered
    }
  }

  try {
    const r = await callWithSessionRecovery(model, params.sessionId)
    return toResult(r)
  } catch (error) {
    const err = toError(error)
    await archive(archiveBase(model, params.sessionId), {
      output: '',
      ok: false,
      error: err.message,
      errorName: err.name,
    })
    throw error
  }
}
