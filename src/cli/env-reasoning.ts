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
  if (global) config.worker.specialist.modelReasoningEffort = global

  const manager = parseReasoning(
    'MIMIKIT_MANAGER_REASONING_EFFORT',
    process.env.MIMIKIT_MANAGER_REASONING_EFFORT,
  )
  if (manager) {
    console.warn(
      '[cli] ignored MIMIKIT_MANAGER_REASONING_EFFORT: manager uses opencode and does not support modelReasoningEffort',
    )
  }

  const standard = parseReasoning(
    'MIMIKIT_WORKER_STANDARD_REASONING_EFFORT',
    process.env.MIMIKIT_WORKER_STANDARD_REASONING_EFFORT,
  )
  if (standard) {
    console.warn(
      '[cli] ignored MIMIKIT_WORKER_STANDARD_REASONING_EFFORT: standard worker uses opencode and does not support modelReasoningEffort',
    )
  }

  const specialist = parseReasoning(
    'MIMIKIT_WORKER_SPECIALIST_REASONING_EFFORT',
    process.env.MIMIKIT_WORKER_SPECIALIST_REASONING_EFFORT,
  )
  if (specialist) config.worker.specialist.modelReasoningEffort = specialist
}
