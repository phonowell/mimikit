import { mergeUsageAdditive } from '../../execution/shared/token-usage.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'
import type { TokenUsage } from '../../foundation/types/index.js'

export type OrchestratorStatus = {
  ok: boolean
  runtimeId: string
  agentStatus: 'idle' | 'running'
  activeTasks: number
  pendingTasks: number
  pendingInputs: number
  managerRunning: boolean
  maxWorkers: number
  managerLastUsage?: TokenUsage
  managerUsageTotal?: TokenUsage
  workerUsageTotal?: TokenUsage
}

const USER_META_STRING_KEYS = [
  'source',
  'platform',
  'channel',
  'remote',
  'userAgent',
  'language',
  'clientLocale',
  'clientTimeZone',
  'clientNowIso',
  'telegramChatId',
  'telegramMessageId',
  'telegramUpdateId',
  'telegramTimestamp',
] as const

export const computeOrchestratorStatus = (
  runtime: RuntimeState,
  pendingInputsCount: number,
): OrchestratorStatus => {
  const workerUsageTotal = runtime.domain.tasks.reduce<TokenUsage | undefined>(
    (acc, task) => mergeUsageAdditive(acc, task.result?.usage ?? task.usage),
    undefined,
  )
  const pendingTasks = runtime.domain.tasks.filter(
    (task) => task.status === 'pending',
  ).length
  const runningTaskIds = new Set(
    runtime.domain.tasks
      .filter((task) => task.status === 'running')
      .map((task) => task.id),
  )
  const activeTasks = [
    ...runtime.process.worker.runningControllers.keys(),
  ].filter((taskId) => runningTaskIds.has(taskId)).length
  const maxWorkers = runtime.config.worker.maxConcurrent
  const agentStatus =
    runtime.process.manager.running || activeTasks > 0 ? 'running' : 'idle'
  return {
    ok: true,
    runtimeId: runtime.runtimeId,
    agentStatus,
    activeTasks,
    pendingTasks,
    pendingInputs: pendingInputsCount,
    managerRunning: runtime.process.manager.running,
    maxWorkers,
    ...(runtime.process.manager.lastUsage
      ? { managerLastUsage: runtime.process.manager.lastUsage }
      : {}),
    ...(runtime.process.manager.usageTotal
      ? { managerUsageTotal: runtime.process.manager.usageTotal }
      : {}),
    ...(workerUsageTotal ? { workerUsageTotal } : {}),
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
