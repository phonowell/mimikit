import { runWithProvider } from '../providers/registry.js'

import type { TokenUsage } from '../types/index.js'

const BYTE_STEP = 1_024
const TIMEOUT_STEP_MS = 2_500
const DEFAULT_MANAGER_PROMPT_MAX_TOKENS = 8_192
const PRUNE_ORDER = [
  'M:intents',
  'M:tasks',
  'M:focus_contexts',
  'M:recent_history',
  'M:focus_list',
  'M:batch_results',
  'M:history_lookup',
  'M:user_profile',
  'M:persona',
]

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

const truncatePromptToBudget = (prompt: string, budgetTokens: number): string => {
  const maxBytes = Math.max(1, budgetTokens) * 4
  const buffer = Buffer.from(prompt, 'utf8')
  if (buffer.byteLength <= maxBytes) return prompt
  return buffer.subarray(0, maxBytes).toString('utf8').trimEnd()
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
  if (estimatedTokens <= budget) {
    return { prompt: current, trimmed: false, estimatedTokens }
  }

  for (const tag of PRUNE_ORDER) {
    const next = removeTagBlock(current, tag)
    if (next === current) continue
    current = next
    estimatedTokens = estimatePromptTokens(current)
    if (estimatedTokens <= budget) {
      return { prompt: current, trimmed: true, estimatedTokens }
    }
  }

  const truncated = truncatePromptToBudget(current, budget)
  estimatedTokens = estimatePromptTokens(truncated)
  if (truncated && estimatedTokens <= budget) {
    return { prompt: truncated, trimmed: true, estimatedTokens }
  }

  throw new Error(
    `[manager] prompt exceeds max token budget (${estimatedTokens}/${budget})`,
  )
}

export const runManagerLlmCall = async (params: {
  prompt: string
  workDir: string
  model?: string
  maxPromptTokens?: number
  onTextDelta?: (delta: string) => void
  onUsage?: (usage: TokenUsage) => void
  logPath?: string
  logContext?: Record<string, unknown>
}): Promise<{
  prompt: string
  output: string
  elapsedMs: number
  usage?: TokenUsage
  threadId?: string | null
}> => {
  const budgeted = enforcePromptBudget(params.prompt, params.maxPromptTokens)
  const timeoutMs = resolveManagerTimeoutMs(budgeted.prompt)
  const result = await runWithProvider({
    provider: 'openai-chat',
    role: 'manager',
    prompt: budgeted.prompt,
    workDir: params.workDir,
    timeoutMs,
    ...(params.model?.trim() ? { model: params.model.trim() } : {}),
    ...(params.onTextDelta ? { onTextDelta: params.onTextDelta } : {}),
    ...(params.onUsage ? { onUsage: params.onUsage } : {}),
    ...(params.logPath ? { logPath: params.logPath } : {}),
    ...(params.logContext ? { logContext: params.logContext } : {}),
  })

  return {
    ...result,
    prompt: budgeted.prompt,
  }
}
