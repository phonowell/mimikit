import type { OrchestratorStatus } from './orchestrator-helpers.js'

export const scheduleOrchestratorRestart = (params: {
  reason: string
  getStatus: () => OrchestratorStatus
  restartScheduled: boolean
  markScheduled: () => void
  runRestart: () => Promise<void>
}): 'scheduled' | 'busy' | 'already_scheduled' => {
  const status = params.getStatus()
  const canRestart =
    status.managerRunning === false &&
    status.activeTasks === 0 &&
    status.pendingTasks === 0
  if (!canRestart) return 'busy'
  if (params.restartScheduled) return 'already_scheduled'

  params.markScheduled()
  setTimeout(() => {
    void params.runRestart()
  }, 100)
  return 'scheduled'
}
