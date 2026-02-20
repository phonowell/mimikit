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
    prompt: {
      /** Hard token limit for manager prompt */
      maxTokens: number
    }
    taskCreate: {
      /** Debounce window for create_task dedup (ms) */
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
    session: {
      /** Timeout for manager session summarize operations (ms) */
      compressTimeoutMs: number
    }
  }
  /** Worker execution configuration */
  worker: {
    maxConcurrent: number
    retry: {
      maxAttempts: number
      backoffMs: number
    }
    profiles: {
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
}

export type OrchestratorConfig = AppConfig

export const defaultConfig = (params: DefaultConfigParams): AppConfig => ({
  workDir: resolve(params.workDir),
  ...loadDefaultConfigFromYaml(),
})
