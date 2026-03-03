import { compareIsoDesc } from '../../shared/time.js'
import { titleFromCandidates } from '../../shared/utils.js'

import type { Task, TaskStatus } from '../../types/index.js'

export type TaskPendingReason =
  | 'waiting_capacity'

export type TaskViewRuntimeSnapshot = {
  maxConcurrentWorkers: number
  runningTaskCount: number
}

export type TaskView = {
  id: string
  kind: 'task'
  status: TaskStatus
  profile: Task['profile']
  focusId: string
  title: string
  cron?: string
  scheduledAt?: string
  createdAt: string
  changeAt: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  usage?: Task['usage']
  archivePath?: string
  pending_reason?: TaskPendingReason
}

export type TaskCounts = Record<TaskStatus, number>

const initCounts = (): TaskCounts => ({
  pending: 0,
  running: 0,
  succeeded: 0,
  failed: 0,
  canceled: 0,
})

const resolveTaskChangeAt = (task: Task): string =>
  task.completedAt ?? task.startedAt ?? task.createdAt

const toFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const resolvePendingReason = (
  task: Task,
  snapshot?: TaskViewRuntimeSnapshot,
): TaskPendingReason | undefined => {
  if (task.status !== 'pending') return undefined
  const maxConcurrentWorkers = toFiniteNumber(snapshot?.maxConcurrentWorkers)
  if (maxConcurrentWorkers === null || maxConcurrentWorkers <= 0)
    return undefined
  const runningTaskCount = toFiniteNumber(snapshot?.runningTaskCount)
  if (runningTaskCount === null || runningTaskCount < 0)
    return undefined
  if (runningTaskCount >= maxConcurrentWorkers) return 'waiting_capacity'
  return undefined
}

const taskToView = (task: Task, snapshot?: TaskViewRuntimeSnapshot): TaskView => {
  const pendingReason = resolvePendingReason(task, snapshot)
  return {
    id: task.id,
    kind: 'task',
    status: task.status,
    profile: task.profile,
    focusId: task.focusId,
    title: task.title || titleFromCandidates(task.id, [task.prompt]),
    ...(task.cron ? { cron: task.cron } : {}),
    ...(task.scheduledAt ? { scheduledAt: task.scheduledAt } : {}),
    createdAt: task.createdAt,
    changeAt: resolveTaskChangeAt(task),
    ...(task.startedAt ? { startedAt: task.startedAt } : {}),
    ...(task.completedAt ? { completedAt: task.completedAt } : {}),
    ...(typeof task.durationMs === 'number'
      ? { durationMs: task.durationMs }
      : {}),
    ...(task.usage ? { usage: task.usage } : {}),
    ...(task.archivePath
      ? { archivePath: task.archivePath }
      : task.result?.archivePath
        ? { archivePath: task.result.archivePath }
        : {}),
    ...(pendingReason ? { pending_reason: pendingReason } : {}),
  }
}

export const buildTaskViews = (
  tasks: Task[],
  limit = 200,
  runtimeSnapshot?: TaskViewRuntimeSnapshot,
): { tasks: TaskView[]; counts: TaskCounts } => {
  const views = tasks.map((task) => taskToView(task, runtimeSnapshot))
  views.sort((a, b) => compareIsoDesc(a.createdAt, b.createdAt))
  const limited = views.slice(0, Math.max(0, limit))
  const counts = initCounts()
  for (const view of limited) counts[view.status] += 1
  return { tasks: limited, counts }
}
