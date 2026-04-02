import { nowIso } from '../../foundation/shared/utils.js'

import type { Task, TaskCancelSource } from '../../foundation/types/index.js'
import type { RuntimeTaskStateSlice } from '../../kernel/orchestrator/runtime-interfaces.js'

const normalizeSessionId = (
  value: string | null | undefined,
): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

const findTask = (runtime: RuntimeTaskStateSlice, taskId: string) =>
  runtime.domain.tasks.find((item) => item.id === taskId)

const resolveTaskTarget = (params: {
  runtime: RuntimeTaskStateSlice
  taskId: string
  task?: Task
}) => findTask(params.runtime, params.taskId) ?? params.task

export const bindRuntimeTaskSession = (params: {
  runtime: RuntimeTaskStateSlice
  taskId: string
  sessionId: string | null | undefined
  task?: Task
}): boolean => {
  const task = resolveTaskTarget(params)
  const normalized = normalizeSessionId(params.sessionId)
  if (!task || !normalized) return false
  if (task.sessionId === normalized && task.sessionState === 'reusable')
    return false
  task.sessionId = normalized
  task.sessionState = 'reusable'
  task.sessionUpdatedAt = nowIso()
  return true
}

export const discardRuntimeTaskSession = (params: {
  runtime: RuntimeTaskStateSlice
  taskId: string
  task?: Task
}): boolean => {
  const task = resolveTaskTarget(params)
  if (!task) return false
  if (!task.sessionId && task.sessionState === 'discarded') return false
  delete task.sessionId
  task.sessionState = 'discarded'
  task.sessionUpdatedAt = nowIso()
  return true
}

export const isRecoverableTaskCancelSource = (
  source: TaskCancelSource | undefined,
): boolean => source === 'deferred' || source === 'system'
