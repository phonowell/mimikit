import { configureManagerActionCliLogger } from '../../policy/manager/action-cli-log.js'
import { applyFeishuEnvOverrides } from '../../surface/channels/feishu/config.js'
import { parseChannelEnabledEnv } from '../../surface/channels/shared/config-env.js'
import { applyTelegramEnvOverrides } from '../../surface/channels/telegram/config.js'

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
  }
  const envManagerModel = process.env.MIMIKIT_MANAGER_MODEL?.trim()
  if (envManagerModel) config.manager.model = envManagerModel
  const envCodexModel = process.env.MIMIKIT_CODEX_MODEL?.trim()
  if (envCodexModel) config.codex.model = envCodexModel
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

const parsePortEnv = (
  envName: string,
  value: string | undefined,
): number | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    console.warn(`[cli] invalid ${envName}:`, value)
    return undefined
  }
  return parsed
}

const applyProxyEnv = (config: AppConfig): void => {
  const globalProxy = trimEnv('MIMIKIT_PROXY')
  if (globalProxy) {
    config.manager.proxy = globalProxy
    config.codex.proxy = globalProxy
  }
  const managerProxy = trimEnv('MIMIKIT_MANAGER_PROXY')
  if (managerProxy) config.manager.proxy = managerProxy
  const codexProxy = trimEnv('MIMIKIT_CODEX_PROXY')
  if (codexProxy) config.codex.proxy = codexProxy
}

const applyProviderEnabledEnv = (config: AppConfig): void => {
  const codexEnabled = parseChannelEnabledEnv({
    envName: 'MIMIKIT_CODEX_ENABLED',
    value: process.env.MIMIKIT_CODEX_ENABLED,
  })
  if (codexEnabled !== undefined) config.codex.enabled = codexEnabled
}

const applyWebUiEnv = (config: AppConfig): void => {
  const enabled = parseChannelEnabledEnv({
    envName: 'MIMIKIT_WEBUI_ENABLED',
    value: process.env.MIMIKIT_WEBUI_ENABLED,
  })
  if (enabled !== undefined) config.webui.enabled = enabled

  const port = parsePortEnv(
    'MIMIKIT_WEBUI_PORT',
    process.env.MIMIKIT_WEBUI_PORT,
  )
  if (port !== undefined) config.webui.port = port
}

export const applyCliEnvOverrides = (config: AppConfig): void => {
  applyModelEnv(config)
  applyReasoningEnv(config)
  applyProxyEnv(config)
  applyProviderEnabledEnv(config)
  applyWebUiEnv(config)
  const actionLogsEnabled = parseChannelEnabledEnv({
    envName: 'MIMIKIT_ACTION_LOGS',
    value: process.env.MIMIKIT_ACTION_LOGS,
  })
  if (actionLogsEnabled !== undefined)
    configureManagerActionCliLogger({ enabled: actionLogsEnabled })
  applyTelegramEnvOverrides(config.telegram)
  applyFeishuEnvOverrides(config.feishu)
}
