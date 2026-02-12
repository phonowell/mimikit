import type { RuntimeState } from './runtime-state.js'

export type OrchestratorStatus = {
  ok: boolean
  agentStatus: 'idle' | 'running'
  activeTasks: number
  pendingTasks: number
  pendingInputs: number
  managerRunning: boolean
  maxWorkers: number
}

export const computeOrchestratorStatus = (
  runtime: RuntimeState,
  pendingInputsCount: number,
): OrchestratorStatus => {
  const pendingTasks = runtime.tasks.filter(
    (task) => task.status === 'pending',
  ).length
  const runningTaskIds = new Set(
    runtime.tasks
      .filter((task) => task.status === 'running')
      .map((task) => task.id),
  )
  const activeTasks = [...runtime.runningControllers.keys()].filter((taskId) =>
    runningTaskIds.has(taskId),
  ).length
  const maxWorkers = runtime.config.worker.maxConcurrent
  const agentStatus =
    runtime.managerRunning || activeTasks > 0 ? 'running' : 'idle'
  return {
    ok: true,
    agentStatus,
    activeTasks,
    pendingTasks,
    pendingInputs: pendingInputsCount,
    managerRunning: runtime.managerRunning,
    maxWorkers,
  }
}
