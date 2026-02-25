import { buildManagerPrompt } from '../prompts/build-prompts.js'
import { runWithProvider } from '../providers/registry.js'
import {
  appendTraceArchiveResult,
  type TraceArchiveResult,
} from '../storage/traces-archive.js'

import type {
  CronJob,
  HistoryLookupMessage,
  IdleIntent,
  ManagerActionFeedback,
  ManagerEnv,
  Task,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'

const BYTE_STEP = 1_024
const TIMEOUT_STEP_MS = 2_500
const DEFAULT_MANAGER_PROMPT_MAX_TOKENS = 8_192
const PRUNE_ORDER = [
  'M:intents',
  'M:tasks',
  'M:results',
  'M:history_lookup',
  'M:user_profile',
  'M:persona',
]

export const toError = (err: unknown): Error =>
  err instanceof Error ? err : new Error(String(err))

const estimatePromptTokens = (prompt: string): number =>
  Math.max(1, Math.ceil(Buffer.byteLength(prompt, 'utf8') / 4))

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const removeTagBlock = (prompt: string, tag: string): string => {
  const pattern = new RegExp(
    `<${escapeRegExp(tag)}>[\\s\\S]*?<\\/${escapeRegExp(tag)}>\\n*`,
    'g',
  )
  return prompt.replace(pattern, '').trim()
}

export const MIN_MANAGER_TIMEOUT_MS = 60_000
export const MAX_MANAGER_TIMEOUT_MS = 120_000

export const resolveManagerTimeoutMs = (prompt: string): number => {
  const promptBytes = Buffer.byteLength(prompt, 'utf8')
  const stepCount = Math.ceil(promptBytes / BYTE_STEP)
  const computed = MIN_MANAGER_TIMEOUT_MS + stepCount * TIMEOUT_STEP_MS
  return Math.max(
    MIN_MANAGER_TIMEOUT_MS,
    Math.min(MAX_MANAGER_TIMEOUT_MS, computed),
  )
}

export const enforcePromptBudget = (
  prompt: string,
  maxTokens: number = DEFAULT_MANAGER_PROMPT_MAX_TOKENS,
): { prompt: string; trimmed: boolean; estimatedTokens: number } => {
  const budget = Math.max(1, maxTokens)
  let current = prompt
  let estimatedTokens = estimatePromptTokens(current)
  if (estimatedTokens <= budget)
    return { prompt: current, trimmed: false, estimatedTokens }

  for (const tag of PRUNE_ORDER) {
    const next = removeTagBlock(current, tag)
    if (next === current) continue
    current = next
    estimatedTokens = estimatePromptTokens(current)
    if (estimatedTokens <= budget)
      return { prompt: current, trimmed: true, estimatedTokens }
  }
  throw new Error(
    `[manager] prompt exceeds max token budget (${estimatedTokens}/${budget})`,
  )
}

export const runManager = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  intents?: IdleIntent[]
  cronJobs?: CronJob[]
  historyLookup?: HistoryLookupMessage[]
  actionFeedback?: ManagerActionFeedback[]
  compressedContext?: string
  env?: ManagerEnv
  model?: string
  maxPromptTokens?: number
  onTextDelta?: (delta: string) => void
  onUsage?: (usage: TokenUsage) => void
}): Promise<{
  output: string
  elapsedMs: number
  usage?: TokenUsage
}> => {
  const prompt = await buildManagerPrompt({
    stateDir: params.stateDir,
    workDir: params.workDir,
    inputs: params.inputs,
    results: params.results,
    tasks: params.tasks,
    ...(params.intents ? { intents: params.intents } : {}),
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

  const callProvider = () =>
    runWithProvider({
      provider: 'openai-chat',
      role: 'manager',
      prompt: budgetedPrompt.prompt,
      workDir: params.workDir,
      timeoutMs,
      ...(model ? { model } : {}),
      ...(params.onTextDelta ? { onTextDelta: params.onTextDelta } : {}),
      ...(params.onUsage ? { onUsage: params.onUsage } : {}),
    })

  try {
    const result = await callProvider()
    await archive(result.threadId ?? undefined, { ...result, ok: true })
    return {
      output: result.output,
      elapsedMs: result.elapsedMs,
      ...(result.usage ? { usage: result.usage } : {}),
    }
  } catch (error) {
    const err = toError(error)
    await archive(undefined, {
      output: '',
      ok: false,
      error: err.message,
      errorName: err.name,
    })
    throw error
  }
}
