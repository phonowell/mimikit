import { resolve } from 'node:path'

import { loadDefaultConfigFromToml } from './config-default-loader.js'

import type { FeishuConfig } from '@mimikit/channels/channels/feishu/config'
import type { TelegramConfig } from '@mimikit/channels/channels/telegram/config'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type DefaultConfigParams = {
  workDir: string
  onUnknownConfigKeys?: (keys: readonly string[]) => void
}

export type PromptSectionLimits = {
  actionFeedbackMaxBytes: number
  batchResultsMaxBytes: number
  compressedContextMaxBytes: number
  environmentMaxBytes: number
  fileLookupMaxBytes: number
  focusContextsMaxBytes: number
  focusListMaxBytes: number
  historyLookupMaxBytes: number
  inputsMaxBytes: number
  memoryMaxBytes: number
  plansMaxBytes: number
  queryLookupMaxBytes: number
  recentHistoryMaxBytes: number
  tasksMaxBytes: number
}

export type AppConfig = {
  workDir: string
  manager: {
    model: string
    modelReasoningEffort: ModelReasoningEffort
    baseUrl?: string | undefined
    apiKey?: string | undefined
    proxy?: string | undefined
    maxCorrectionRounds: number
    promptSections: PromptSectionLimits
    taskCreate: {
      debounceMs: number
    }
    taskWindow: {
      maxCount: number
      minCount: number
    }
    planWindow: {
      maxCount: number
      minCount: number
    }
  }
  worker: {
    maxConcurrent: number
    retry: {
      maxAttempts: number
      backoffMs: number
    }
    timeoutMs: number
  }
  codex: {
    enabled: boolean
    model: string
    modelReasoningEffort: ModelReasoningEffort
    capability: 'low' | 'medium' | 'high'
    billing: 'free' | 'low' | 'medium' | 'high'
    proxy?: string | undefined
  }
  opencode: {
    enabled: boolean
    model: string
    capability: 'low' | 'medium' | 'high'
    billing: 'free' | 'low' | 'medium' | 'high'
    proxy?: string | undefined
  }
  webui: {
    enabled: boolean
    port: number
  }
  telegram: TelegramConfig
  feishu: FeishuConfig
}

const INTERNAL_MANAGER_DEFAULTS = {
  maxCorrectionRounds: 3,
  promptSections: {
    actionFeedbackMaxBytes: 8192,
    batchResultsMaxBytes: 20480,
    compressedContextMaxBytes: 12288,
    environmentMaxBytes: 4096,
    fileLookupMaxBytes: 20480,
    focusContextsMaxBytes: 20480,
    focusListMaxBytes: 8192,
    historyLookupMaxBytes: 20480,
    inputsMaxBytes: 8192,
    memoryMaxBytes: 8192,
    plansMaxBytes: 16384,
    queryLookupMaxBytes: 20480,
    recentHistoryMaxBytes: 8192,
    tasksMaxBytes: 24576,
  },
  taskCreate: {
    debounceMs: 4000,
  },
  taskWindow: {
    maxCount: 20,
    minCount: 5,
  },
  planWindow: {
    maxCount: 20,
    minCount: 5,
  },
} as const

const INTERNAL_WORKER_DEFAULTS = {
  retry: {
    maxAttempts: 1,
    backoffMs: 5000,
  },
} as const

export const defaultConfig = (params: DefaultConfigParams): AppConfig => {
  const userConfig = loadDefaultConfigFromToml(
    undefined,
    params.onUnknownConfigKeys
      ? { onUnknownKeys: params.onUnknownConfigKeys }
      : {},
  )
  return {
    workDir: resolve(params.workDir),
    manager: {
      model: userConfig.manager.model,
      modelReasoningEffort: userConfig.manager.modelReasoningEffort,
      ...(userConfig.manager.baseUrl
        ? { baseUrl: userConfig.manager.baseUrl }
        : {}),
      ...(userConfig.manager.apiKey
        ? { apiKey: userConfig.manager.apiKey }
        : {}),
      ...(userConfig.manager.proxy ? { proxy: userConfig.manager.proxy } : {}),
      ...INTERNAL_MANAGER_DEFAULTS,
    },
    worker: {
      maxConcurrent: userConfig.worker.maxConcurrent,
      timeoutMs: userConfig.worker.timeoutMs,
      ...INTERNAL_WORKER_DEFAULTS,
    },
    codex: {
      enabled: userConfig.codex.enabled,
      model: userConfig.codex.model,
      modelReasoningEffort: userConfig.codex.modelReasoningEffort,
      capability: userConfig.codex.capability,
      billing: userConfig.codex.billing,
      ...(userConfig.codex.proxy ? { proxy: userConfig.codex.proxy } : {}),
    },
    opencode: {
      enabled: userConfig.opencode.enabled,
      model: userConfig.opencode.model,
      capability: userConfig.opencode.capability,
      billing: userConfig.opencode.billing,
      ...(userConfig.opencode.proxy
        ? { proxy: userConfig.opencode.proxy }
        : {}),
    },
    webui: {
      enabled: userConfig.webui.enabled,
      port: userConfig.webui.port,
    },
    telegram: userConfig.telegram,
    feishu: userConfig.feishu,
  }
}
