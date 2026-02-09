import type { AppConfig } from '../config.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

const ALLOWED_REASONING_EFFORT: ModelReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]

const parseReasoning = (
  envName: string,
  value: string | undefined,
): ModelReasoningEffort | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (ALLOWED_REASONING_EFFORT.includes(trimmed as ModelReasoningEffort))
    return trimmed as ModelReasoningEffort
  console.warn(`[cli] invalid ${envName}:`, trimmed)
  return undefined
}

export const applyReasoningEnv = (config: AppConfig): void => {
  const global = parseReasoning(
    'MIMIKIT_REASONING_EFFORT',
    process.env.MIMIKIT_REASONING_EFFORT,
  )
  if (global) {
    config.teller.modelReasoningEffort = global
    config.thinker.modelReasoningEffort = global
    config.worker.standard.modelReasoningEffort = global
    config.worker.expert.modelReasoningEffort = global
  }
  const teller = parseReasoning(
    'MIMIKIT_TELLER_REASONING_EFFORT',
    process.env.MIMIKIT_TELLER_REASONING_EFFORT,
  )
  if (teller) config.teller.modelReasoningEffort = teller
  const thinker = parseReasoning(
    'MIMIKIT_THINKER_REASONING_EFFORT',
    process.env.MIMIKIT_THINKER_REASONING_EFFORT,
  )
  if (thinker) config.thinker.modelReasoningEffort = thinker
  const standard = parseReasoning(
    'MIMIKIT_WORKER_STANDARD_REASONING_EFFORT',
    process.env.MIMIKIT_WORKER_STANDARD_REASONING_EFFORT,
  )
  if (standard) config.worker.standard.modelReasoningEffort = standard
  const expert = parseReasoning(
    'MIMIKIT_WORKER_EXPERT_REASONING_EFFORT',
    process.env.MIMIKIT_WORKER_EXPERT_REASONING_EFFORT,
  )
  if (expert) config.worker.expert.modelReasoningEffort = expert
}
