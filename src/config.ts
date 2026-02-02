import { resolve } from 'node:path'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type SupervisorConfig = {
  stateDir: string
  workDir: string
  teller: {
    pollMs: number
    debounceMs: number
    maxNoticeWaitMs: number
    historyLimit: number
    model?: string
    modelReasoningEffort?: ModelReasoningEffort
  }
  thinker: {
    settleMs: number
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
  teller: {
    pollMs: 1000,
    debounceMs: 2000,
    maxNoticeWaitMs: 5000,
    historyLimit: 100,
    model: 'gpt-5.1',
  },
  thinker: {
    settleMs: 30_000,
  },
  worker: {
    maxConcurrent: 3,
    timeoutMs: 10 * 60 * 1000,
  },
})
