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
    config.codex.model = envModel
    config.opencode.model = envModel
  }
  const envManagerModel = process.env.MIMIKIT_MANAGER_MODEL?.trim()
  if (envManagerModel) config.manager.model = envManagerModel
  const envCodexModel = process.env.MIMIKIT_CODEX_MODEL?.trim()
  if (envCodexModel) config.codex.model = envCodexModel
  const envOpencodeModel = process.env.MIMIKIT_OPENCODE_MODEL?.trim()
  if (envOpencodeModel) config.opencode.model = envOpencodeModel
}
const applyReasoningEnv = (config: AppConfig): void => {
  const global = parseReasoning(
    'MIMIKIT_REASONING_EFFORT',
    process.env.MIMIKIT_REASONING_EFFORT,
  )
  if (global) {
    config.manager.modelReasoningEffort = global
    config.codex.modelReasoningEffort = global
  }
  const manager = parseReasoning(
    'MIMIKIT_MANAGER_REASONING_EFFORT',
    process.env.MIMIKIT_MANAGER_REASONING_EFFORT,
  )
  if (manager) config.manager.modelReasoningEffort = manager
  const codex = parseReasoning(
    'MIMIKIT_CODEX_REASONING_EFFORT',
    process.env.MIMIKIT_CODEX_REASONING_EFFORT,
  )
  if (codex) config.codex.modelReasoningEffort = codex
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
    config.manager.proxy = globalProxy
    config.codex.proxy = globalProxy
    config.opencode.proxy = globalProxy
  }
  const managerProxy = trimEnv('MIMIKIT_MANAGER_PROXY')
  if (managerProxy) config.manager.proxy = managerProxy
  const codexProxy = trimEnv('MIMIKIT_CODEX_PROXY')
  if (codexProxy) config.codex.proxy = codexProxy
  const opencodeProxy = trimEnv('MIMIKIT_OPENCODE_PROXY')
  if (opencodeProxy) config.opencode.proxy = opencodeProxy
}

const applyProviderEnabledEnv = (config: AppConfig): void => {
  const codexEnabled = parseBooleanEnv(
    'MIMIKIT_CODEX_ENABLED',
    process.env.MIMIKIT_CODEX_ENABLED,
  )
  if (codexEnabled !== undefined) config.codex.enabled = codexEnabled
  const opencodeEnabled = parseBooleanEnv(
    'MIMIKIT_OPENCODE_ENABLED',
    process.env.MIMIKIT_OPENCODE_ENABLED,
  )
  if (opencodeEnabled !== undefined) config.opencode.enabled = opencodeEnabled
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
  applyProviderEnabledEnv(config)
  applyWebUiEnv(config)
  applyTelegramEnvOverrides(config.telegram)
}
