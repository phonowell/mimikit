import { compareIsoDesc } from '../../foundation/shared/time.js'
import { resolveTaskResourceMode } from '../../work/shared/task-resource-mode.js'
import { resolveTaskChangeAt } from '../../work/shared/task-state.js'

import {
  deriveTaskGitClosure,
  type TaskGitClosureView,
} from './task-git-closure.js'
import {
  resolveDispatchLockDetail,
  type TaskDispatchLockDetail,
} from './task-view-dispatch-lock.js'

import type {
  Task,
  TaskResourceMode,
  TaskResultStopReason,
  TaskStatus,
} from '../../foundation/types/index.js'

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
  resourceMode: TaskResourceMode
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
  traceRef?: string
  stopReason?: TaskResultStopReason
  pending_reason?: TaskPendingReason
  dispatchLock?: TaskDispatchLockDetail
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

const resolveTaskViewTitle = (task: Task): string => {
  const title = task.title.trim()
  return title || task.id
}

const resolvePendingReason = (
  task: Task,
  tasks: Task[],
  snapshot?: TaskViewRuntimeSnapshot,
  taskStatus: TaskStatus = task.status,
): TaskPendingReason | undefined => {
  if (resolveDispatchLockDetail(task, tasks, taskStatus))
    return 'waiting_dispatch_lock'
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
  const { status } = task
  const dispatchLock = resolveDispatchLockDetail(task, tasks, status)
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
    resourceMode: resolveTaskResourceMode(task.resourceMode),
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
    ...(task.result?.traceRef ? { traceRef: task.result.traceRef } : {}),
    ...(task.result?.stopReason ? { stopReason: task.result.stopReason } : {}),
    ...(pendingReason ? { pending_reason: pendingReason } : {}),
    ...(dispatchLock ? { dispatchLock } : {}),
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
