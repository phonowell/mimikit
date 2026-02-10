import { resolve } from 'node:path'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type AppConfig = {
  stateDir: string
  workDir: string
  reporting: {
    dailyReportEnabled: boolean
    runtimeHighLatencyMs: number
    runtimeHighUsageTotal: number
  }
  manager: {
    pollMs: number
    minIntervalMs: number
    maxBatch: number
    queueCompactMinPackets: number
    taskSnapshotMaxCount: number
    tasksMaxCount: number
    tasksMinCount: number
    tasksMaxBytes: number
    historyMinCount: number
    historyMaxCount: number
    historyMaxBytes: number
    model: string
    modelReasoningEffort: ModelReasoningEffort
  }
  evolver: {
    pollMs: number
    idleThresholdMs: number
    minIntervalMs: number
  }
  worker: {
    maxConcurrent: number
    retryMaxAttempts: number
    retryBackoffMs: number
    standard: {
      timeoutMs: number
      model: string
      modelReasoningEffort: ModelReasoningEffort
    }
    specialist: {
      timeoutMs: number
      model: string
      modelReasoningEffort: ModelReasoningEffort
    }
  }
}

export type OrchestratorConfig = AppConfig

export const defaultConfig = (params: {
  stateDir: string
  workDir: string
}): AppConfig => ({
  stateDir: resolve(params.stateDir),
  workDir: resolve(params.workDir),
  reporting: {
    dailyReportEnabled: true,
    runtimeHighLatencyMs: 15 * 60 * 1_000,
    runtimeHighUsageTotal: 100_000,
  },
  manager: {
    pollMs: 1_000,
    minIntervalMs: 8_000,
    maxBatch: 100,
    queueCompactMinPackets: 1_000,
    taskSnapshotMaxCount: 2_000,
    tasksMaxCount: 20,
    tasksMinCount: 5,
    tasksMaxBytes: 20 * 1024,
    historyMinCount: 20,
    historyMaxCount: 100,
    historyMaxBytes: 20 * 1024,
    model: 'gpt-5.2-high',
    modelReasoningEffort: 'high',
  },
  evolver: {
    pollMs: 2_000,
    idleThresholdMs: 60_000,
    minIntervalMs: 5 * 60 * 1_000,
  },
  worker: {
    maxConcurrent: 3,
    retryMaxAttempts: 1,
    retryBackoffMs: 5_000,
    standard: {
      timeoutMs: 5 * 60 * 1_000,
      model: 'gpt-5.2-high',
      modelReasoningEffort: 'high',
    },
    specialist: {
      timeoutMs: 10 * 60 * 1_000,
      model: 'gpt-5.3-codex-high',
      modelReasoningEffort: 'high',
    },
  },
})
