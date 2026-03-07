import { compareIsoDesc } from '../../shared/time.js'
import { titleFromCandidates } from '../../shared/utils.js'

import type { Task, TaskStatus } from '../../types/index.js'

export type TaskPendingReason = 'waiting_capacity'

export type TaskViewRuntimeSnapshot = {
  maxConcurrentWorkers: number
  runningTaskCount: number
  liveOutputByTaskId?: ReadonlyMap<string, string>
}

export type TaskView = {
  id: string
  kind: 'task'
  status: TaskStatus
  profile: Task['profile']
  provider: Task['provider']
  focusId: string
  title: string
  cron?: string
  scheduledAt?: string
  createdAt: string
  changeAt: string
  startedAt?: string
  pausedAt?: string
  completedAt?: string
  durationMs?: number
  usage?: Task['usage']
  archivePath?: string
  pending_reason?: TaskPendingReason
  liveOutput?: string
}

export type TaskCounts = Record<TaskStatus, number>

const TASK_STATUS_RANK: Record<TaskStatus, number> = {
  running: 0,
  paused: 1,
  pending: 2,
  failed: 3,
  succeeded: 4,
  canceled: 5,
}

const initCounts = (): TaskCounts => ({
  pending: 0,
  paused: 0,
  running: 0,
  succeeded: 0,
  failed: 0,
  canceled: 0,
})

const resolveTaskChangeAt = (task: Task): string =>
  task.completedAt ?? task.pausedAt ?? task.startedAt ?? task.createdAt

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
  if (runningTaskCount === null || runningTaskCount < 0) return undefined
  if (runningTaskCount >= maxConcurrentWorkers) return 'waiting_capacity'
  return undefined
}

const taskToView = (
  task: Task,
  snapshot?: TaskViewRuntimeSnapshot,
): TaskView => {
  const pendingReason = resolvePendingReason(task, snapshot)
  const liveOutput =
    task.status === 'running'
      ? snapshot?.liveOutputByTaskId?.get(task.id)?.trim()
      : undefined
  return {
    id: task.id,
    kind: 'task',
    status: task.status,
    profile: task.profile,
    provider: task.provider,
    focusId: task.focusId,
    title: task.title || titleFromCandidates(task.id, [task.prompt]),
    ...(task.cron ? { cron: task.cron } : {}),
    ...(task.scheduledAt ? { scheduledAt: task.scheduledAt } : {}),
    createdAt: task.createdAt,
    changeAt: resolveTaskChangeAt(task),
    ...(task.startedAt ? { startedAt: task.startedAt } : {}),
    ...(task.pausedAt ? { pausedAt: task.pausedAt } : {}),
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
    ...(liveOutput ? { liveOutput } : {}),
  }
}

const compareTaskViews = (a: TaskView, b: TaskView): number => {
  const statusDiff = TASK_STATUS_RANK[a.status] - TASK_STATUS_RANK[b.status]
  if (statusDiff !== 0) return statusDiff
  const changeDiff = compareIsoDesc(a.changeAt, b.changeAt)
  if (changeDiff !== 0) return changeDiff
  const createdDiff = compareIsoDesc(a.createdAt, b.createdAt)
  if (createdDiff !== 0) return createdDiff
  return a.id.localeCompare(b.id)
}

export const buildTaskViews = (
  tasks: Task[],
  limit = 200,
  runtimeSnapshot?: TaskViewRuntimeSnapshot,
): { tasks: TaskView[]; counts: TaskCounts } => {
  const views = tasks.map((task) => taskToView(task, runtimeSnapshot))
  views.sort(compareTaskViews)
  const limited = views.slice(0, Math.max(0, limit))
  const counts = initCounts()
  for (const view of limited) counts[view.status] += 1
  return { tasks: limited, counts }
}
