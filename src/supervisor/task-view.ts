import { listItems } from '../storage/queue.js'
import { readTaskStatus } from '../storage/task-status.js'

import type { StatePaths } from '../fs/paths.js'
import type {
  PlannerResult,
  Task,
  TaskStatus,
  WorkerResult,
} from '../types/tasks.js'

export type TaskView = {
  id: string
  status: 'pending' | 'running' | 'done' | 'failed'
  title: string
  createdAt?: string
  completedAt?: string
}

export type TaskCounts = {
  pending: number
  running: number
  done: number
  failed: number
}

const firstLine = (text?: string): string => {
  if (!text) return ''
  const line =
    text
      .split('\n')
      .find((item) => item.trim())
      ?.trim() ?? ''
  if (!line) return ''
  if (line.length <= 120) return line
  return `${line.slice(0, 117)}...`
}

const titleFrom = (
  id: string,
  candidates: Array<string | undefined>,
): string => {
  for (const candidate of candidates) {
    const line = firstLine(candidate)
    if (line) return line
  }
  return id
}

const taskTime = (task: TaskView): number => {
  const iso = task.completedAt ?? task.createdAt
  if (!iso) return 0
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) ? ms : 0
}

const taskToView = (task: Task, status: TaskView['status']): TaskView => ({
  id: task.id,
  status,
  title: titleFrom(task.id, [task.prompt]),
  createdAt: task.createdAt,
})

const workerResultToView = (result: WorkerResult): TaskView => {
  const view: TaskView = {
    id: result.id,
    status: result.status,
    title: titleFrom(result.id, [
      typeof result.result === 'string' ? result.result : undefined,
      result.error,
    ]),
    completedAt: result.completedAt,
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
  const triggerPrompt = result.triggers?.[0]?.prompt
  return {
    id: result.id,
    status,
    title: titleFrom(result.id, [
      result.question,
      taskPrompt,
      triggerPrompt,
      result.error,
    ]),
    completedAt: result.completedAt,
  }
}

const statusToView = (status: TaskStatus): TaskView => ({
  id: status.id,
  status: status.status,
  title: status.id,
  completedAt: status.completedAt,
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
    listItems<Task>(paths.plannerQueue),
    listItems<Task>(paths.workerQueue),
    listItems<Task>(paths.plannerRunning),
    listItems<Task>(paths.workerRunning),
    listItems<PlannerResult>(paths.plannerResults),
    listItems<WorkerResult>(paths.workerResults),
    readTaskStatus(paths.taskStatus),
  ])

  const tasks: TaskView[] = [
    ...plannerQueue.map((task) => taskToView(task, 'pending')),
    ...workerQueue.map((task) => taskToView(task, 'pending')),
    ...plannerRunning.map((task) => taskToView(task, 'running')),
    ...workerRunning.map((task) => taskToView(task, 'running')),
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
