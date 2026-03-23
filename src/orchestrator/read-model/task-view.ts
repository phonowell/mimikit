import { buildTaskDispatchLockKey } from '../../shared/task-execution-target.js'
import {
  isBudgetRecoverableTask,
  resolveTaskChangeAt,
} from '../../shared/task-state.js'
import { compareIsoDesc } from '../../shared/time.js'

import {
  deriveTaskGitClosure,
  type TaskGitClosureView,
} from './task-git-closure.js'

import type {
  Task,
  TaskResultStopReason,
  TaskStatus,
} from '../../types/index.js'

export type TaskPendingReason = 'waiting_capacity' | 'waiting_dispatch_lock'

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
  git?: Task['git']
  gitClosure?: TaskGitClosureView
  createdAt: string
  changeAt: string
  startedAt?: string
  pausedAt?: string
  completedAt?: string
  durationMs?: number
  usage?: Task['usage']
  archivePath?: string
  stopReason?: TaskResultStopReason
  recoverable?: boolean
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

const toFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const hasNonEmptyText = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0

const resolveTaskViewTitle = (task: Task): string => {
  const title = task.title.trim()
  return title || task.id
}

const resolveTaskViewStatus = (task: Task): TaskStatus => {
  if (task.status !== 'succeeded') return task.status
  const hasCompletedAt = hasNonEmptyText(task.completedAt)
  const hasConsistentResult = !task.result || task.result.status === 'succeeded'
  if (hasCompletedAt && hasConsistentResult) return 'succeeded'
  if (hasNonEmptyText(task.pausedAt)) return 'paused'
  if (hasNonEmptyText(task.startedAt)) return 'running'
  return 'pending'
}

const resolveDispatchLockPendingReason = (
  task: Task,
  tasks: Task[],
  taskStatus: TaskStatus,
): TaskPendingReason | undefined => {
  if (taskStatus !== 'pending') return undefined
  const lockKey = buildTaskDispatchLockKey(task)
  for (const item of tasks) {
    if (item.id === task.id || item.status !== 'running') continue
    if (buildTaskDispatchLockKey(item) !== lockKey) continue
    return 'waiting_dispatch_lock'
  }
  return undefined
}

const resolvePendingReason = (
  task: Task,
  tasks: Task[],
  snapshot?: TaskViewRuntimeSnapshot,
  taskStatus: TaskStatus = task.status,
): TaskPendingReason | undefined => {
  const dispatchLockReason = resolveDispatchLockPendingReason(
    task,
    tasks,
    taskStatus,
  )
  if (dispatchLockReason) return dispatchLockReason
  if (taskStatus !== 'pending') return undefined
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
  tasks: Task[],
  snapshot?: TaskViewRuntimeSnapshot,
): TaskView => {
  const status = resolveTaskViewStatus(task)
  const pendingReason = resolvePendingReason(task, tasks, snapshot, status)
  const liveOutput =
    status === 'running'
      ? snapshot?.liveOutputByTaskId?.get(task.id)?.trim()
      : undefined
  const gitClosure = deriveTaskGitClosure(task)
  return {
    id: task.id,
    kind: 'task',
    status,
    profile: task.profile,
    provider: task.provider,
    focusId: task.focusId,
    title: resolveTaskViewTitle(task),
    ...(task.git ? { git: task.git } : {}),
    ...(gitClosure ? { gitClosure } : {}),
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
    ...(task.result?.stopReason ? { stopReason: task.result.stopReason } : {}),
    ...(isBudgetRecoverableTask(task) ? { recoverable: true } : {}),
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
  const views = tasks.map((task) => taskToView(task, tasks, runtimeSnapshot))
  views.sort(compareTaskViews)
  const limited = views.slice(0, Math.max(0, limit))
  const counts = initCounts()
  for (const view of limited) counts[view.status] += 1
  return { tasks: limited, counts }
}
