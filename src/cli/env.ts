import { applyQqEnvOverrides } from '../channels/qq/config.js'
import type { AppConfig } from '../config.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

const ALLOWED_REASONING_EFFORT: ModelReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]
const parseEnvPositiveInteger = (
  name: string,
  value: string | undefined,
): number | undefined => {
  if (!value) return undefined
  const parsed = Number(value)
  if (Number.isInteger(parsed) && parsed > 0) return parsed
  console.warn(`[cli] invalid ${name}:`, value)
  return undefined
}
const parseEnvNonNegativeInteger = (
  name: string,
  value: string | undefined,
): number | undefined => {
  if (!value) return undefined
  const parsed = Number(value)
  if (Number.isInteger(parsed) && parsed >= 0) return parsed
  console.warn(`[cli] invalid ${name}:`, value)
  return undefined
}
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
const applyModelEnv = (config: AppConfig): void => {
  const envModel = process.env.MIMIKIT_MODEL?.trim()
  if (envModel) config.manager.model = envModel
  const envManagerModel = process.env.MIMIKIT_MANAGER_MODEL?.trim()
  if (envManagerModel) config.manager.model = envManagerModel
  const envWorkerModel = process.env.MIMIKIT_WORKER_MODEL?.trim()
  if (envWorkerModel) config.worker.model = envWorkerModel
}
const applyReasoningEnv = (config: AppConfig): void => {
  const global = parseReasoning(
    'MIMIKIT_REASONING_EFFORT',
    process.env.MIMIKIT_REASONING_EFFORT,
  )
  if (global) config.worker.modelReasoningEffort = global
  const worker = parseReasoning(
    'MIMIKIT_WORKER_REASONING_EFFORT',
    process.env.MIMIKIT_WORKER_REASONING_EFFORT,
  )
  if (worker) config.worker.modelReasoningEffort = worker
}
const applyLoopEnv = (config: AppConfig): void => {
  const managerCreateTaskDebounceMs = parseEnvNonNegativeInteger(
    'MIMIKIT_MANAGER_CREATE_TASK_DEBOUNCE_MS',
    process.env.MIMIKIT_MANAGER_CREATE_TASK_DEBOUNCE_MS?.trim(),
  )
  if (managerCreateTaskDebounceMs !== undefined)
    config.manager.taskCreate.debounceMs = managerCreateTaskDebounceMs
  const managerIdleTriggerDelayMs = parseEnvNonNegativeInteger(
    'MIMIKIT_MANAGER_IDLE_TRIGGER_DELAY_MS',
    process.env.MIMIKIT_MANAGER_IDLE_TRIGGER_DELAY_MS?.trim(),
  )
  if (managerIdleTriggerDelayMs !== undefined)
    config.manager.idleTrigger.delayMs = managerIdleTriggerDelayMs
  const managerPlanWindowMaxCount = parseEnvPositiveInteger(
    'MIMIKIT_MANAGER_PLAN_WINDOW_MAX_COUNT',
    process.env.MIMIKIT_MANAGER_PLAN_WINDOW_MAX_COUNT?.trim(),
  )
  if (managerPlanWindowMaxCount !== undefined)
    config.manager.planWindow.maxCount = managerPlanWindowMaxCount
  const managerPlanWindowMinCount = parseEnvPositiveInteger(
    'MIMIKIT_MANAGER_PLAN_WINDOW_MIN_COUNT',
    process.env.MIMIKIT_MANAGER_PLAN_WINDOW_MIN_COUNT?.trim(),
  )
  if (managerPlanWindowMinCount !== undefined)
    config.manager.planWindow.minCount = managerPlanWindowMinCount
}
export const applyCliEnvOverrides = (config: AppConfig): void => {
  applyModelEnv(config)
  applyReasoningEnv(config)
  applyLoopEnv(config)
  applyQqEnvOverrides(config.qq)
}
