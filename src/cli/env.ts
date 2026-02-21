import {
  parseEnvNonNegativeInteger,
  parseEnvPositiveInteger,
} from './env-parse.js'
import { applyReasoningEnv } from './env-reasoning.js'

import type { AppConfig } from '../config.js'

const applyModelEnv = (config: AppConfig): void => {
  const envModel = process.env.MIMIKIT_MODEL?.trim()
  if (envModel) config.manager.model = envModel

  const envManagerModel = process.env.MIMIKIT_MANAGER_MODEL?.trim()
  if (envManagerModel) config.manager.model = envManagerModel
  const envWorkerModel = process.env.MIMIKIT_WORKER_MODEL?.trim()
  if (envWorkerModel) config.worker.model = envWorkerModel
}

const applyLoopEnv = (config: AppConfig): void => {
  const managerPromptMaxTokens = parseEnvPositiveInteger(
    'MIMIKIT_MANAGER_PROMPT_MAX_TOKENS',
    process.env.MIMIKIT_MANAGER_PROMPT_MAX_TOKENS?.trim(),
  )
  if (managerPromptMaxTokens !== undefined)
    config.manager.prompt.maxTokens = managerPromptMaxTokens

  const managerCreateTaskDebounceMs = parseEnvNonNegativeInteger(
    'MIMIKIT_MANAGER_CREATE_TASK_DEBOUNCE_MS',
    process.env.MIMIKIT_MANAGER_CREATE_TASK_DEBOUNCE_MS?.trim(),
  )
  if (managerCreateTaskDebounceMs !== undefined)
    config.manager.taskCreate.debounceMs = managerCreateTaskDebounceMs
}

export const applyCliEnvOverrides = (config: AppConfig): void => {
  applyModelEnv(config)
  applyReasoningEnv(config)
  applyLoopEnv(config)
}
