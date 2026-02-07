import { resolve } from 'node:path'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type SupervisorConfig = {
  stateDir: string
  workDir: string
  evolve: {
    idleReviewEnabled: boolean
    idleReviewIntervalMs: number
    idleReviewHistoryCount: number
    runtimeHighLatencyMs: number
    runtimeHighUsageTotal: number
  }
  manager: {
    pollMs: number
    debounceMs: number
    maxResultWaitMs: number
    tasksMaxCount: number
    tasksMinCount: number
    tasksMaxBytes: number
    historyMinCount: number
    historyMaxCount: number
    historyMaxBytes: number
    model: string
    modelReasoningEffort: ModelReasoningEffort
  }
  worker: {
    maxConcurrent: number
    timeoutMs: number
    retryMaxAttempts: number
    retryBackoffMs: number
    model: string
    modelReasoningEffort: ModelReasoningEffort
  }
}

export const defaultConfig = (params: {
  stateDir: string
  workDir: string
}): SupervisorConfig => ({
  stateDir: resolve(params.stateDir),
  workDir: resolve(params.workDir),
  evolve: {
    idleReviewEnabled: true,
    idleReviewIntervalMs: 30 * 60 * 1_000,
    idleReviewHistoryCount: 100,
    runtimeHighLatencyMs: 15 * 60 * 1_000,
    runtimeHighUsageTotal: 100_000,
  },
  manager: {
    pollMs: 1_000,
    debounceMs: 10_000,
    maxResultWaitMs: 20_000,
    tasksMaxCount: 20,
    tasksMinCount: 5,
    tasksMaxBytes: 20 * 1024,
    historyMinCount: 20,
    historyMaxCount: 100,
    historyMaxBytes: 20 * 1024,
    model: 'gpt-5.2-high',
    modelReasoningEffort: 'high',
  },
  worker: {
    maxConcurrent: 3,
    timeoutMs: 10 * 60 * 1_000,
    retryMaxAttempts: 1,
    retryBackoffMs: 5_000,
    model: 'gpt-5.3-codex-high',
    modelReasoningEffort: 'high',
  },
})
