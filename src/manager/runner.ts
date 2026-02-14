import { buildManagerPrompt } from '../prompts/build-prompts.js'
import { runWithProvider } from '../providers/registry.js'
import {
  appendLlmArchiveResult,
  type LlmArchiveEntry,
  type LlmArchiveResult,
} from '../storage/llm-archive.js'

import type { FocusState } from '../orchestrator/core/runtime-state.js'
import type {
  CronJob,
  HistoryMessage,
  ManagerEnv,
  Task,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

const normalizeOptional = (value?: string | null): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

const DEFAULT_FALLBACK_MODEL = normalizeOptional(
  process.env['MIMIKIT_FALLBACK_MODEL'],
)

const toError = (err: unknown): Error =>
  err instanceof Error ? err : new Error(String(err))

const BYTE_STEP = 1_024
const TIMEOUT_STEP_MS = 2_500
export const MIN_MANAGER_TIMEOUT_MS = 60_000
export const MAX_MANAGER_TIMEOUT_MS = 120_000
const DEFAULT_MANAGER_PROMPT_MAX_TOKENS = 8_192

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

const enforcePromptBudget = (
  prompt: string,
  maxTokens: number,
): { prompt: string; trimmed: boolean; estimatedTokens: number } => {
  const budget = Math.max(1, maxTokens)
  let current = prompt
  let estimatedTokens = estimatePromptTokens(current)
  if (estimatedTokens <= budget)
    return { prompt: current, trimmed: false, estimatedTokens }

  const pruneOrder = [
    'M:compacted_context',
    'M:history',
    'M:tasks',
    'M:results',
  ]
  for (const tag of pruneOrder) {
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

export const resolveManagerTimeoutMs = (prompt: string): number => {
  const promptBytes = Buffer.byteLength(prompt, 'utf8')
  const stepCount = Math.ceil(promptBytes / BYTE_STEP)
  const computed = MIN_MANAGER_TIMEOUT_MS + stepCount * TIMEOUT_STEP_MS
  return Math.max(
    MIN_MANAGER_TIMEOUT_MS,
    Math.min(MAX_MANAGER_TIMEOUT_MS, computed),
  )
}

export const runManager = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  cronJobs?: CronJob[]
  history: HistoryMessage[]
  env?: ManagerEnv
  focusState?: FocusState
  compactedContext?: string
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  seed?: number
  temperature?: number
  fallbackModel?: string
  maxPromptTokens?: number
  onTextDelta?: (delta: string) => void
  onUsage?: (usage: TokenUsage) => void
  onStreamReset?: () => void
}): Promise<{
  output: string
  elapsedMs: number
  fallbackUsed: boolean
  usage?: TokenUsage
}> => {
  const prompt = await buildManagerPrompt({
    stateDir: params.stateDir,
    workDir: params.workDir,
    inputs: params.inputs,
    results: params.results,
    tasks: params.tasks,
    ...(params.cronJobs ? { cronJobs: params.cronJobs } : {}),
    history: params.history,
    ...(params.env ? { env: params.env } : {}),
    ...(params.focusState ? { focusState: params.focusState } : {}),
    ...(params.compactedContext
      ? { compactedContext: params.compactedContext }
      : {}),
  })
  const model = normalizeOptional(params.model)
  const sampling = {
    ...(params.seed !== undefined ? { seed: params.seed } : {}),
    ...(params.temperature !== undefined
      ? { temperature: params.temperature }
      : {}),
  }
  const fallbackModel = normalizeOptional(
    params.fallbackModel ?? DEFAULT_FALLBACK_MODEL,
  )
  const budgetedPrompt = enforcePromptBudget(
    prompt,
    params.maxPromptTokens ?? DEFAULT_MANAGER_PROMPT_MAX_TOKENS,
  )
  const timeoutMs = resolveManagerTimeoutMs(budgetedPrompt.prompt)

  type ArchiveBase = Omit<LlmArchiveEntry, 'prompt' | 'output' | 'ok'>
  const archive = (base: ArchiveBase, result: LlmArchiveResult) =>
    appendLlmArchiveResult(params.stateDir, base, budgetedPrompt.prompt, result)

  const archiveBase = (
    callModel: string | undefined,
    label: 'primary' | 'fallback',
  ): ArchiveBase => ({
    role: 'manager',
    ...(callModel ? { model: callModel } : {}),
    attempt: label,
    ...sampling,
  })

  const callProvider = (callModel: string | undefined) =>
    runWithProvider({
      provider: 'openai-chat',
      prompt: budgetedPrompt.prompt,
      timeoutMs,
      ...(callModel ? { model: callModel } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
      ...(params.onTextDelta ? { onTextDelta: params.onTextDelta } : {}),
      ...(params.onUsage ? { onUsage: params.onUsage } : {}),
      ...sampling,
    })

  const toResult = (
    r: { output: string; elapsedMs: number; usage?: TokenUsage },
    fallbackUsed: boolean,
  ) => ({
    output: r.output,
    elapsedMs: r.elapsedMs,
    fallbackUsed,
    ...(r.usage ? { usage: r.usage } : {}),
  })

  try {
    const r = await callProvider(model)
    await archive(archiveBase(model, 'primary'), { ...r, ok: true })
    return toResult(r, false)
  } catch (error) {
    const err = toError(error)
    await archive(archiveBase(model, 'primary'), {
      output: '',
      ok: false,
      error: err.message,
      errorName: err.name,
    })
    if (!fallbackModel) throw error
    params.onStreamReset?.()
    try {
      const r = await callProvider(fallbackModel)
      await archive(archiveBase(fallbackModel, 'fallback'), { ...r, ok: true })
      return toResult(r, true)
    } catch (fallbackError) {
      const fbErr = toError(fallbackError)
      await archive(archiveBase(fallbackModel, 'fallback'), {
        output: '',
        ok: false,
        error: fbErr.message,
        errorName: fbErr.name,
      })
      throw fallbackError
    }
  }
}
