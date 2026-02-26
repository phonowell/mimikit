import type { RuntimeState, UserMeta } from './runtime-state.js'

export type OrchestratorStatus = {
  ok: boolean
  runtimeId: string
  agentStatus: 'idle' | 'running'
  activeTasks: number
  pendingTasks: number
  pendingInputs: number
  managerRunning: boolean
  maxWorkers: number
}

const USER_META_STRING_KEYS = [
  'source',
  'remote',
  'userAgent',
  'language',
  'clientLocale',
  'clientTimeZone',
  'clientNowIso',
] as const

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
    runtimeId: runtime.runtimeId,
    agentStatus,
    activeTasks,
    pendingTasks,
    pendingInputs: pendingInputsCount,
    managerRunning: runtime.managerRunning,
    maxWorkers,
  }
}

export const toUserInputLogMeta = (meta?: UserMeta): Partial<UserMeta> => {
  if (!meta) return {}
  const output: Partial<UserMeta> = {}
  for (const key of USER_META_STRING_KEYS) {
    const value = meta[key]
    if (value) output[key] = value
  }
  if (meta.clientOffsetMinutes !== undefined)
    output.clientOffsetMinutes = meta.clientOffsetMinutes
  return output
}
