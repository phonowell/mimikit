import { bestEffort } from '../../../log/safe.js'

import { appendRuntimeIssue } from './worker-runtime-utils.js'

import type { Task } from '../../../types/index.js'
import type { RuntimeState } from '../../core/runtime-state.js'

export const appendWorkerRetryFeedback = async (params: {
  runtime: RuntimeState
  task: Task
  error: unknown
}): Promise<void> => {
  const { runtime, task, error } = params
  await bestEffort('appendReportingEvent: worker_retry', () =>
    appendRuntimeIssue({
      runtime,
      severity: 'medium',
      category: 'failure',
      message: `worker retry: ${
        error instanceof Error ? error.message : String(error)
      }`,
      note: 'worker_retry',
      task,
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
  if (elapsedMs < runtime.config.reporting.runtimeHighLatencyMs) return
  await bestEffort('appendReportingEvent: worker_high_latency', () =>
    appendRuntimeIssue({
      runtime,
      severity:
        elapsedMs >= runtime.config.reporting.runtimeHighLatencyMs * 2
          ? 'high'
          : 'medium',
      category: 'latency',
      message: `worker high latency: ${elapsedMs}ms`,
      note: 'worker_high_latency',
      task,
      elapsedMs,
      usageTotal,
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
  if (usageTotal < runtime.config.reporting.runtimeHighUsageTotal) return
  await bestEffort('appendReportingEvent: worker_high_usage', () =>
    appendRuntimeIssue({
      runtime,
      severity:
        usageTotal >= runtime.config.reporting.runtimeHighUsageTotal * 2
          ? 'high'
          : 'medium',
      category: 'cost',
      message: `worker high usage: ${usageTotal} tokens`,
      note: 'worker_high_usage',
      task,
      elapsedMs,
      usageTotal,
    }),
  )
}

export const appendWorkerFailedFeedback = async (params: {
  runtime: RuntimeState
  task: Task
  message: string
}): Promise<void> => {
  const { runtime, task, message } = params
  await bestEffort('appendReportingEvent: worker_failed', () =>
    appendRuntimeIssue({
      runtime,
      severity: 'high',
      category: 'failure',
      message: `worker failed: ${message}`,
      note: 'worker_failed',
      task,
    }),
  )
}
