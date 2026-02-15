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
    /** Hard token limit for manager prompt */
    promptMaxTokens: number
    /** Debounce window for create_task dedup (ms) */
    createTaskDebounceMs: number
    /** Task list retention upper bound */
    tasksMaxCount: number
    /** Task list retention lower bound */
    tasksMinCount: number
    /** Task list retention byte limit */
    tasksMaxBytes: number
    /** Default manager model */
    model: string
    /** Defaults for manager-profile tasks */
    task: {
      timeoutMs: number
      model: string
    }
  }
  /** Evolver loop configuration */
  evolver: {
    enabled: boolean
    pollMs: number
    idleThresholdMs: number
    minIntervalMs: number
  }
  /** Worker execution configuration */
  worker: {
    maxConcurrent: number
    retryMaxAttempts: number
    retryBackoffMs: number
    standard: {
      timeoutMs: number
      model: string
    }
    specialist: {
      timeoutMs: number
      model: string
      modelReasoningEffort: ModelReasoningEffort
    }
  }
}

export type OrchestratorConfig = AppConfig

export const defaultConfig = (params: DefaultConfigParams): AppConfig => ({
  workDir: resolve(params.workDir),
  ...loadDefaultConfigFromYaml(),
})
