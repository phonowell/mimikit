import { parseIsoMs } from '../../foundation/shared/time.js'

import {
  bindRuntimeTaskSession,
  discardRuntimeTaskSession,
  isRecoverableTaskCancelSource,
} from './task-session-write.js'

import type { Task, TaskCancelMeta } from '../../foundation/types/index.js'
import type { OrchestratorRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const buildTaskCancelMeta = (meta?: {
  source?: string
  reason?: string
}): TaskCancelMeta => ({
  source:
    meta?.source === 'user' || meta?.source === 'http'
      ? 'user'
      : meta?.source === 'deferred'
        ? 'deferred'
        : 'system',
  ...(meta?.reason ? { reason: meta.reason } : {}),
})

export const applyTaskCancelSessionPolicy = (params: {
  runtime: OrchestratorRuntime
  taskId: string
  task: Task
  cancelSource: TaskCancelMeta['source']
}): 'reusable' | 'discarded' | 'none' => {
  if (params.cancelSource === 'user') {
    return discardRuntimeTaskSession({
      runtime: params.runtime,
      taskId: params.taskId,
    })
      ? 'discarded'
      : 'none'
  }
  if (!isRecoverableTaskCancelSource(params.cancelSource)) return 'none'
  if (!params.task.sessionId) return 'none'
  bindRuntimeTaskSession({
    runtime: params.runtime,
    taskId: params.taskId,
    sessionId: params.task.sessionId,
  })
  return 'reusable'
}

export const resolveTaskElapsedDurationMs = (params: {
  task: Task
  completedAt?: string
}): number | undefined => {
  const startedAtMs = parseIsoMs(params.task.startedAt ?? '')
  if (startedAtMs === undefined) return 0
  if (!params.completedAt) return Math.max(0, Date.now() - startedAtMs)
  const completedAtMs = parseIsoMs(params.completedAt)
  if (completedAtMs === undefined) return undefined
  return Math.max(0, completedAtMs - startedAtMs)
}
