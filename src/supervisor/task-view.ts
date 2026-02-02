import {
  migratePlannerResult,
  migrateTask,
  migrateWorkerResult,
} from '../storage/migrations.js'
import { listItems } from '../storage/queue.js'
import { readTaskStatus } from '../storage/task-status.js'
import { titleFromCandidates } from '../tasks/summary.js'

import type { StatePaths } from '../fs/paths.js'
import type {
  PlannerResult,
  Task,
  TaskStatus,
  WorkerResult,
} from '../types/tasks.js'
import type { TokenUsage } from '../types/usage.js'

export type TaskView = {
  id: string
  status: 'pending' | 'running' | 'done' | 'failed'
  role: 'planner' | 'worker'
  title: string
  createdAt?: string
  completedAt?: string
  durationMs?: number
  usage?: TokenUsage
}

export type TaskCounts = {
  pending: number
  running: number
  done: number
  failed: number
}

const taskTime = (task: TaskView): number => {
  const iso = task.completedAt ?? task.createdAt
  if (!iso) return 0
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) ? ms : 0
}

const taskToView = (
  task: Task,
  status: TaskView['status'],
  role: TaskView['role'],
): TaskView => ({
  id: task.id,
  status,
  role,
  title: titleFromCandidates(task.id, [task.summary, task.prompt]),
  createdAt: task.createdAt,
})

const workerResultToView = (result: WorkerResult): TaskView => {
  const view: TaskView = {
    id: result.id,
    status: result.status,
    role: 'worker',
    title: titleFromCandidates(result.id, [
      result.task?.summary,
      result.task?.prompt,
    ]),
    completedAt: result.completedAt,
    ...(result.durationMs !== undefined
      ? { durationMs: result.durationMs }
      : {}),
    ...(result.usage ? { usage: result.usage } : {}),
  }
  if (result.startedAt) view.createdAt = result.startedAt
  return view
}

const plannerResultToView = (result: PlannerResult): TaskView => {
  const status =
    result.status === 'failed'
      ? 'failed'
      : result.status === 'needs_input'
        ? 'pending'
        : 'done'
  const taskPrompt = result.tasks?.[0]?.prompt
  const taskSummary = result.tasks?.[0]?.summary
  const triggerPrompt = result.triggers?.[0]?.prompt
  return {
    id: result.id,
    status,
    role: 'planner',
    title: titleFromCandidates(result.id, [
      result.summary,
      result.question,
      taskSummary,
      taskPrompt,
      triggerPrompt,
      result.error,
    ]),
    completedAt: result.completedAt,
    ...(result.durationMs !== undefined
      ? { durationMs: result.durationMs }
      : {}),
    ...(result.usage ? { usage: result.usage } : {}),
  }
}

const statusToView = (status: TaskStatus): TaskView => ({
  id: status.id,
  status: status.status === 'needs_input' ? 'pending' : status.status,
  role: status.role ?? 'worker',
  title: titleFromCandidates(status.id, [status.summary]),
  completedAt: status.completedAt,
  ...(status.durationMs !== undefined ? { durationMs: status.durationMs } : {}),
  ...(status.usage ? { usage: status.usage } : {}),
})

const countTasks = (tasks: TaskView[]): TaskCounts => {
  const counts: TaskCounts = { pending: 0, running: 0, done: 0, failed: 0 }
  for (const task of tasks) counts[task.status]++
  return counts
}

export const buildTaskViews = async (
  paths: StatePaths,
  limit = 200,
): Promise<{ tasks: TaskView[]; counts: TaskCounts }> => {
  const [
    plannerQueue,
    workerQueue,
    plannerRunning,
    workerRunning,
    plannerResults,
    workerResults,
    taskStatusIndex,
  ] = await Promise.all([
    listItems<Task>(paths.plannerQueue, migrateTask),
    listItems<Task>(paths.workerQueue, migrateTask),
    listItems<Task>(paths.plannerRunning, migrateTask),
    listItems<Task>(paths.workerRunning, migrateTask),
    listItems<PlannerResult>(paths.plannerResults, migratePlannerResult),
    listItems<WorkerResult>(paths.workerResults, migrateWorkerResult),
    readTaskStatus(paths.taskStatus),
  ])

  const tasks: TaskView[] = [
    ...plannerQueue.map((task) => taskToView(task, 'pending', 'planner')),
    ...workerQueue.map((task) => taskToView(task, 'pending', 'worker')),
    ...plannerRunning.map((task) => taskToView(task, 'running', 'planner')),
    ...workerRunning.map((task) => taskToView(task, 'running', 'worker')),
    ...plannerResults.map((result) => plannerResultToView(result)),
    ...workerResults.map((result) => workerResultToView(result)),
  ]

  const existing = new Set(tasks.map((task) => task.id))
  for (const status of Object.values(taskStatusIndex)) {
    if (existing.has(status.id)) continue
    tasks.push(statusToView(status))
  }

  tasks.sort((a, b) => taskTime(b) - taskTime(a))

  const limited = tasks.slice(0, Math.max(0, limit))
  const counts = countTasks(limited)
  return { tasks: limited, counts }
}
