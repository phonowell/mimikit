import { computeOrchestratorStatus } from '../orchestrator/core/orchestrator-helpers.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

export type ScheduleManagerRestartResult =
  | 'scheduled'
  | 'busy'
  | 'already_scheduled'
  | 'unavailable'

export const canScheduleManagerRestart = (runtime: RuntimeState): boolean => {
  const status = computeOrchestratorStatus(
    runtime,
    runtime.session.inflightInputs.length,
  )
  return status.activeTasks === 0 && status.pendingTasks === 0
}

export const scheduleManagerRestart = (
  runtime: RuntimeState,
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
  runtime: RuntimeState,
): string | undefined => {
  const reason = runtime.session.pendingRestartReason?.trim()
  delete runtime.session.pendingRestartReason
  if (!reason) return undefined
  return reason
}
