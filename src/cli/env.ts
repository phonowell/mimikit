import { applyTelegramEnvOverrides } from '../channels/telegram/config.js'

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
const applyModelEnv = (config: AppConfig): void => {
  const envModel = process.env.MIMIKIT_MODEL?.trim()
  if (envModel) {
    config.manager.model = envModel
    config.worker.model = envModel
  }
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
  if (global) {
    config.manager.modelReasoningEffort = global
    config.worker.modelReasoningEffort = global
  }
  const manager = parseReasoning(
    'MIMIKIT_MANAGER_REASONING_EFFORT',
    process.env.MIMIKIT_MANAGER_REASONING_EFFORT,
  )
  if (manager) config.manager.modelReasoningEffort = manager
  const worker = parseReasoning(
    'MIMIKIT_WORKER_REASONING_EFFORT',
    process.env.MIMIKIT_WORKER_REASONING_EFFORT,
  )
  if (worker) config.worker.modelReasoningEffort = worker
}

const trimEnv = (name: string): string | undefined => {
  const value = process.env[name]
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const parseBooleanEnv = (
  envName: string,
  value: string | undefined,
): boolean | undefined => {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === '1' || normalized === 'true' || normalized === 'yes')
    return true
  if (normalized === '0' || normalized === 'false' || normalized === 'no')
    return false
  console.warn(`[cli] invalid ${envName}:`, value)
  return undefined
}

const applyProxyEnv = (config: AppConfig): void => {
  const globalProxy = trimEnv('MIMIKIT_PROXY')
  if (globalProxy) {
    config.manager.provider.proxy = globalProxy
    config.worker.proxy = globalProxy
  }
  const managerProxy = trimEnv('MIMIKIT_MANAGER_PROXY')
  if (managerProxy) config.manager.provider.proxy = managerProxy
  const workerProxy = trimEnv('MIMIKIT_WORKER_PROXY')
  if (workerProxy) config.worker.proxy = workerProxy
}

const applyWebUiEnv = (config: AppConfig): void => {
  const enabled = parseBooleanEnv(
    'MIMIKIT_WEBUI_ENABLED',
    process.env.MIMIKIT_WEBUI_ENABLED,
  )
  if (enabled !== undefined) config.webui.enabled = enabled
}

export const applyCliEnvOverrides = (config: AppConfig): void => {
  applyModelEnv(config)
  applyReasoningEnv(config)
  applyProxyEnv(config)
  applyWebUiEnv(config)
  applyTelegramEnvOverrides(config.telegram)
}
