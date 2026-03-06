import { resolve } from 'node:path'

import { loadDefaultConfigFromYaml } from './config-default-loader.js'

import type { QqConfig } from './channels/qq/config.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type DefaultConfigParams = {
  workDir: string
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
  taskArchiveLookupMaxBytes: number
  tasksMaxBytes: number
}

export type AppConfig = {
  workDir: string
  manager: {
    model: string
    modelReasoningEffort: ModelReasoningEffort
    provider: {
      baseUrl?: string | undefined
      apiKey?: string | undefined
    }
    maxCorrectionRounds: number
    promptSections: PromptSectionLimits
    taskCreate: {
      debounceMs: number
    }
    idleTrigger: {
      delayMs: number
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
    model: string
    modelReasoningEffort: ModelReasoningEffort
  }
  qq: QqConfig
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
    taskArchiveLookupMaxBytes: 20480,
    tasksMaxBytes: 24576,
  },
  taskCreate: {
    debounceMs: 4000,
  },
  idleTrigger: {
    delayMs: 900000,
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
  const userConfig = loadDefaultConfigFromYaml()
  return {
    workDir: resolve(params.workDir),
    manager: {
      model: userConfig.manager.model,
      modelReasoningEffort: userConfig.manager.modelReasoningEffort,
      provider: userConfig.manager.provider,
      ...INTERNAL_MANAGER_DEFAULTS,
    },
    worker: {
      maxConcurrent: userConfig.worker.maxConcurrent,
      timeoutMs: userConfig.worker.timeoutMs,
      model: userConfig.worker.model,
      modelReasoningEffort: userConfig.worker.modelReasoningEffort,
      ...INTERNAL_WORKER_DEFAULTS,
    },
    qq: userConfig.qq,
  }
}
