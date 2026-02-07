import { resolve } from 'node:path'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type SupervisorConfig = {
  stateDir: string
  workDir: string
  evolve: {
    enabled: boolean
    idlePollMs: number
    maxRounds: number
    minPassRateDelta: number
    minTokenDelta: number
    minLatencyDeltaMs: number
    feedbackHistoryLimit: number
    feedbackSuiteMaxCases: number
  }
  tokenBudget: {
    enabled: boolean
    dailyTotal: number
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
    model?: string
    modelReasoningEffort?: ModelReasoningEffort
  }
  worker: {
    maxConcurrent: number
    timeoutMs: number
    retryMaxAttempts: number
    retryBackoffMs: number
    model?: string
  }
}

export const defaultConfig = (params: {
  stateDir: string
  workDir: string
}): SupervisorConfig => ({
  stateDir: resolve(params.stateDir),
  workDir: resolve(params.workDir),
  evolve: {
    enabled: true,
    idlePollMs: 15_000,
    maxRounds: 1,
    minPassRateDelta: 0,
    minTokenDelta: 50,
    minLatencyDeltaMs: 200,
    feedbackHistoryLimit: 30,
    feedbackSuiteMaxCases: 200,
  },
  tokenBudget: {
    enabled: true,
    dailyTotal: 500_000_000,
  },
  manager: {
    pollMs: 1000,
    debounceMs: 10000,
    maxResultWaitMs: 20000,
    tasksMaxCount: 20,
    tasksMinCount: 5,
    tasksMaxBytes: 20480,
    historyMinCount: 20,
    historyMaxCount: 100,
    historyMaxBytes: 20 * 1024,
    model: 'gpt-5.2-high',
  },
  worker: {
    maxConcurrent: 3,
    timeoutMs: 10 * 60 * 1000,
    retryMaxAttempts: 1,
    retryBackoffMs: 5_000,
    model: 'gpt-5.3-codex-high',
  },
})
