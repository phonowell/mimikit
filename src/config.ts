import { resolve } from 'node:path'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type SupervisorConfig = {
  stateDir: string
  workDir: string
  manager: {
    pollMs: number
    debounceMs: number
    maxResultWaitMs: number
    historyMinCount: number
    historyMaxCount: number
    historyMaxBytes: number
    model?: string
    modelReasoningEffort?: ModelReasoningEffort
  }
  worker: {
    maxConcurrent: number
    timeoutMs: number
  }
  local: {
    enabled: boolean
    baseUrl: string
    model: string
    timeoutMs: number
    idleMs: number
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
    historyMinCount: 20,
    historyMaxCount: 100,
    historyMaxBytes: 20 * 1024,
    model: 'gpt-5.2',
  },
  worker: {
    maxConcurrent: 3,
    timeoutMs: 10 * 60 * 1000,
  },
  local: {
    enabled: true,
    baseUrl: 'http://localhost:11434',
    model: 'qwen3:0.6b',
    timeoutMs: 10_000,
    idleMs: 5 * 60 * 1000,
  },
})
