import { resolve } from 'node:path'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type SupervisorConfig = {
  stateDir: string
  workDir: string
  manager: {
    pollMs: number
    debounceMs: number
    maxResultWaitMs: number
    historyLimit: number
    model?: string
    modelReasoningEffort?: ModelReasoningEffort
  }
  worker: {
    maxConcurrent: number
    timeoutMs: number
  }
}

export const defaultConfig = (params: {
  stateDir: string
  workDir: string
}): SupervisorConfig => ({
  stateDir: resolve(params.stateDir),
  workDir: resolve(params.workDir),
  manager: {
    pollMs: 1000,
    debounceMs: 2000,
    maxResultWaitMs: 5000,
    historyLimit: 100,
    model: 'gpt-5.1',
  },
  worker: {
    maxConcurrent: 3,
    timeoutMs: 10 * 60 * 1000,
  },
})
