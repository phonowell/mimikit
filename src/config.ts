import { resolve } from 'node:path'

import { loadDefaultConfigFromYaml } from './config-default-loader.js'

import type { QqConfig } from './channels/qq/config.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type ManagerLlmMode = 'auto' | 'chat' | 'responses'

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
    /** LLM mode for manager calls: auto prefers chat */
    mode: ManagerLlmMode
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
      memoryMaxBytes: number
      plansMaxBytes: number
      recentHistoryMaxBytes: number
      tasksMaxBytes: number
    }
    taskCreate: {
      /** Debounce window for run_task dedup (ms) */
      debounceMs: number
    }
    idleTrigger: {
      /** Idle duration before on_idle plans can be triggered (ms) */
      delayMs: number
    }
    taskWindow: {
      /** Task list retention upper bound */
      maxCount: number
      /** Task list retention lower bound */
      minCount: number
    }
    planWindow: {
      /** Plan list retention upper bound */
      maxCount: number
      /** Plan list retention lower bound */
      minCount: number
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
  /** QQ webhook + C2C passive reply settings */
  qq: QqConfig
}
export const defaultConfig = (params: DefaultConfigParams): AppConfig => ({
  workDir: resolve(params.workDir),
  ...loadDefaultConfigFromYaml(),
})
