const BYTE_STEP = 1_024
const TIMEOUT_STEP_MS = 2_500
const DEFAULT_MANAGER_PROMPT_MAX_TOKENS = 8_192
const PRUNE_ORDER = [
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
