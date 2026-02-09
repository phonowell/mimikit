import { appendReportingEvent } from '../reporting/events.js'

import type { RuntimeState } from './runtime-state.js'
import type { Task } from '../types/index.js'

export const appendRuntimeIssue = (params: {
  runtime: RuntimeState
  message: string
  severity: 'low' | 'medium' | 'high'
  category: 'quality' | 'latency' | 'cost' | 'failure' | 'ux' | 'other'
  note: string
  task?: Task
  elapsedMs?: number
  usageTotal?: number
}): Promise<void> =>
  appendReportingEvent({
    stateDir: params.runtime.config.stateDir,
    source: 'runtime',
    category: params.category,
    severity: params.severity,
    message: params.message,
    note: params.note,
    ...(params.task ? { taskId: params.task.id } : {}),
    ...(params.elapsedMs !== undefined ? { elapsedMs: params.elapsedMs } : {}),
    ...(params.usageTotal !== undefined
      ? { usageTotal: params.usageTotal }
      : {}),
  }).then(() => undefined)
