import { bestEffort } from '../log/safe.js'

import { appendRuntimeIssue } from './worker-feedback.js'

import type { RuntimeState } from './runtime-state.js'
import type { Task } from '../types/index.js'

export const appendWorkerRetryFeedback = async (params: {
  runtime: RuntimeState
  task: Task
  error: unknown
}): Promise<void> => {
  const { runtime, task, error } = params
  await bestEffort('appendEvolveFeedback: worker_retry', () =>
    appendRuntimeIssue({
      runtime,
      severity: 'medium',
      category: 'failure',
      message: `worker retry: ${
        error instanceof Error ? error.message : String(error)
      }`,
      note: 'worker_retry',
      task,
      confidence: 0.75,
      roiScore: 64,
      action: 'fix',
    }),
  )
}

export const appendWorkerHighLatencyFeedback = async (params: {
  runtime: RuntimeState
  task: Task
  elapsedMs: number
  usageTotal: number
}): Promise<void> => {
  const { runtime, task, elapsedMs, usageTotal } = params
  if (elapsedMs < runtime.config.evolve.runtimeHighLatencyMs) return
  await bestEffort('appendEvolveFeedback: worker_high_latency', () =>
    appendRuntimeIssue({
      runtime,
      severity:
        elapsedMs >= runtime.config.evolve.runtimeHighLatencyMs * 2
          ? 'high'
          : 'medium',
      category: 'latency',
      message: `worker high latency: ${elapsedMs}ms`,
      note: 'worker_high_latency',
      task,
      elapsedMs,
      usageTotal,
      confidence: 0.85,
      roiScore:
        elapsedMs >= runtime.config.evolve.runtimeHighLatencyMs * 2 ? 85 : 68,
      action: 'fix',
    }),
  )
}

export const appendWorkerHighUsageFeedback = async (params: {
  runtime: RuntimeState
  task: Task
  elapsedMs: number
  usageTotal: number
}): Promise<void> => {
  const { runtime, task, elapsedMs, usageTotal } = params
  if (usageTotal < runtime.config.evolve.runtimeHighUsageTotal) return
  await bestEffort('appendEvolveFeedback: worker_high_usage', () =>
    appendRuntimeIssue({
      runtime,
      severity:
        usageTotal >= runtime.config.evolve.runtimeHighUsageTotal * 2
          ? 'high'
          : 'medium',
      category: 'cost',
      message: `worker high usage: ${usageTotal} tokens`,
      note: 'worker_high_usage',
      task,
      elapsedMs,
      usageTotal,
      confidence: 0.85,
      roiScore:
        usageTotal >= runtime.config.evolve.runtimeHighUsageTotal * 2 ? 87 : 70,
      action: 'fix',
    }),
  )
}

export const appendWorkerFailedFeedback = async (params: {
  runtime: RuntimeState
  task: Task
  message: string
}): Promise<void> => {
  const { runtime, task, message } = params
  await bestEffort('appendEvolveFeedback: worker_failed', () =>
    appendRuntimeIssue({
      runtime,
      severity: 'high',
      category: 'failure',
      message: `worker failed: ${message}`,
      note: 'worker_failed',
      task,
      confidence: 0.95,
      roiScore: 92,
      action: 'fix',
    }),
  )
}
