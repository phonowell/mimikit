import { resolve } from 'node:path'

import { loadDefaultConfigFromYaml } from './config-default-loader.js'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type DefaultConfigParams = {
  /** Absolute working directory path */
  workDir: string
}

export type AppConfig = {
  /** Absolute work directory (also state root) */
  workDir: string
  /** Manager scheduling and prompt settings */
  manager: {
    /** Default manager model */
    model: string
    /** Max rounds for manager correction loop */
    maxCorrectionRounds: number
    promptSections: {
      actionFeedbackMaxBytes: number
      batchResultsMaxBytes: number
      compressedContextMaxBytes: number
      environmentMaxBytes: number
      fileLookupMaxBytes: number
      focusContextsMaxBytes: number
      focusListMaxBytes: number
      historyLookupMaxBytes: number
      inputsMaxBytes: number
      templatesMaxBytes: number
      personaMaxBytes: number
      recentHistoryMaxBytes: number
      tasksMaxBytes: number
      userProfileMaxBytes: number
    }
    taskCreate: {
      /** Debounce window for run_task dedup (ms) */
      debounceMs: number
    }
    taskWindow: {
      /** Task list retention upper bound */
      maxCount: number
      /** Task list retention lower bound */
      minCount: number
      /** Task list retention byte limit */
      maxBytes: number
    }
    templateWindow: {
      /** Template list retention upper bound */
      maxCount: number
      /** Template list retention lower bound */
      minCount: number
      /** Template list retention byte limit */
      maxBytes: number
    }
  }
  /** Worker execution configuration */
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
}

export const defaultConfig = (params: DefaultConfigParams): AppConfig => ({
  workDir: resolve(params.workDir),
  ...loadDefaultConfigFromYaml(),
})
