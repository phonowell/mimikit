import type {
  ModelReasoningEffort,
  ProviderBilling,
  ProviderCapability,
  UserConfigInput,
} from './user-config-schema.js'
import type { FeishuConfig } from '../../surface/channels/feishu/config.js'
import type { TelegramConfig } from '../../surface/channels/telegram/config.js'

export type UserConfigDefaults = {
  manager: {
    model: string
    modelReasoningEffort: ModelReasoningEffort
    baseUrl?: string | undefined
    apiKey?: string | undefined
    proxy?: string | undefined
    maxCorrectionRounds: number
  }
  worker: {
    maxConcurrent: number
    timeoutMs: number
  }
  codex: {
    enabled: boolean
    model: string
    modelReasoningEffort: ModelReasoningEffort
    capability: ProviderCapability
    billing: ProviderBilling
    proxy?: string | undefined
  }
  webui: {
    enabled: boolean
    port: number
  }
  telegram: TelegramConfig
  feishu: FeishuConfig
}

const DEFAULT_USER_CONFIG: UserConfigDefaults = {
  manager: {
    model: 'gpt-5.2',
    modelReasoningEffort: 'medium',
    baseUrl: '',
    apiKey: '',
    proxy: '',
    maxCorrectionRounds: 3,
  },
  worker: {
    maxConcurrent: 3,
    timeoutMs: 600000,
  },
  codex: {
    enabled: true,
    model: 'gpt-5.4',
    modelReasoningEffort: 'high',
    capability: 'high',
    billing: 'medium',
    proxy: '',
  },
  webui: {
    enabled: true,
    port: 8787,
  },
  telegram: {
    enabled: false,
    botToken: '',
    chatId: '',
    apiRoot: 'https://api.telegram.org',
    proxy: '',
  },
  feishu: {
    enabled: false,
    appId: '',
    appSecret: '',
    chatId: '',
  },
}

const trimToUndefined = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const trimOrEmpty = (value: string | undefined): string => {
  if (value === undefined) return ''
  return value.trim()
}

export const buildUserConfigDefaults = (
  input: UserConfigInput,
): UserConfigDefaults => {
  const baseUrl = trimToUndefined(input.manager?.baseUrl)
  const apiKey = trimToUndefined(input.manager?.apiKey)
  const managerProxy = trimToUndefined(input.manager?.proxy)
  const codexProxy = trimToUndefined(input.codex?.proxy)
  const telegramApiRoot = trimToUndefined(input.telegram?.apiRoot)

  return {
    manager: {
      model: input.manager?.model ?? DEFAULT_USER_CONFIG.manager.model,
      modelReasoningEffort:
        input.manager?.modelReasoningEffort ??
        DEFAULT_USER_CONFIG.manager.modelReasoningEffort,
      ...(baseUrl ? { baseUrl } : {}),
      ...(apiKey ? { apiKey } : {}),
      ...(managerProxy ? { proxy: managerProxy } : {}),
      maxCorrectionRounds:
        input.manager?.maxCorrectionRounds ??
        DEFAULT_USER_CONFIG.manager.maxCorrectionRounds,
    },
    worker: {
      maxConcurrent:
        input.worker?.maxConcurrent ?? DEFAULT_USER_CONFIG.worker.maxConcurrent,
      timeoutMs:
        input.worker?.timeoutMs ?? DEFAULT_USER_CONFIG.worker.timeoutMs,
    },
    codex: {
      enabled: input.codex?.enabled ?? DEFAULT_USER_CONFIG.codex.enabled,
      model: input.codex?.model ?? DEFAULT_USER_CONFIG.codex.model,
      modelReasoningEffort:
        input.codex?.modelReasoningEffort ??
        DEFAULT_USER_CONFIG.codex.modelReasoningEffort,
      capability:
        input.codex?.capability ?? DEFAULT_USER_CONFIG.codex.capability,
      billing: input.codex?.billing ?? DEFAULT_USER_CONFIG.codex.billing,
      ...(codexProxy ? { proxy: codexProxy } : {}),
    },
    webui: {
      enabled: input.webui?.enabled ?? DEFAULT_USER_CONFIG.webui.enabled,
      port: input.webui?.port ?? DEFAULT_USER_CONFIG.webui.port,
    },
    telegram: {
      enabled: input.telegram?.enabled ?? DEFAULT_USER_CONFIG.telegram.enabled,
      botToken: trimOrEmpty(
        input.telegram?.botToken ?? DEFAULT_USER_CONFIG.telegram.botToken,
      ),
      chatId: trimOrEmpty(
        input.telegram?.chatId ?? DEFAULT_USER_CONFIG.telegram.chatId,
      ),
      apiRoot: telegramApiRoot ?? DEFAULT_USER_CONFIG.telegram.apiRoot,
      proxy: trimOrEmpty(
        input.telegram?.proxy ?? DEFAULT_USER_CONFIG.telegram.proxy,
      ),
    },
    feishu: {
      enabled: input.feishu?.enabled ?? DEFAULT_USER_CONFIG.feishu.enabled,
      appId: trimOrEmpty(
        input.feishu?.appId ?? DEFAULT_USER_CONFIG.feishu.appId,
      ),
      appSecret: trimOrEmpty(
        input.feishu?.appSecret ?? DEFAULT_USER_CONFIG.feishu.appSecret,
      ),
      chatId: trimOrEmpty(
        input.feishu?.chatId ?? DEFAULT_USER_CONFIG.feishu.chatId,
      ),
    },
  }
}
