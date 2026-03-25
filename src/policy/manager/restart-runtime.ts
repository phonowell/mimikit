import { computeOrchestratorStatus } from '../../kernel/orchestrator/orchestrator-helpers.js'

import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export type ScheduleManagerRestartResult =
  | 'scheduled'
  | 'busy'
  | 'already_scheduled'
  | 'unavailable'

export const canScheduleManagerRestart = (runtime: ManagerRuntime): boolean => {
  const status = computeOrchestratorStatus(
    runtime,
    runtime.session.inflightInputs.length,
  )
  return status.activeTasks === 0 && status.pendingTasks === 0
}

export const scheduleManagerRestart = (
  runtime: ManagerRuntime,
  reason: string,
): ScheduleManagerRestartResult => {
  if (!runtime.session.requestExit) return 'unavailable'
  if (runtime.session.restartScheduled) return 'already_scheduled'
  if (!canScheduleManagerRestart(runtime)) return 'busy'
  runtime.session.restartScheduled = true
  runtime.session.pendingRestartReason = reason
  return 'scheduled'
}

export const consumePendingManagerRestartReason = (
  runtime: ManagerRuntime,
): string | undefined => {
  const reason = runtime.session.pendingRestartReason?.trim()
  delete runtime.session.pendingRestartReason
  if (!reason) return undefined
  return reason
}

export const flushPendingManagerRestart = (
  runtime: ManagerRuntime,
): boolean => {
  const reason = consumePendingManagerRestartReason(runtime)
  if (!reason) return false
  runtime.session.requestExit?.({
    code: 75,
    reason,
    skipPersist: true,
  })
  return true
}
