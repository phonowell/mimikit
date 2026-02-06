import { titleFromCandidates } from '../tasks/queue.js'

import type { Task, TaskStatus } from '../types/index.js'

export type TaskView = {
  id: string
  status: TaskStatus
  title: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  usage?: Task['usage']
  archivePath?: string
}

export type TaskCounts = Record<TaskStatus, number>

const initCounts = (): TaskCounts => ({
  pending: 0,
  running: 0,
  succeeded: 0,
  failed: 0,
  canceled: 0,
})

const taskToView = (task: Task): TaskView => ({
  id: task.id,
  status: task.status,
  title: task.title || titleFromCandidates(task.id, [task.prompt]),
  createdAt: task.createdAt,
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
})

export const buildTaskViews = (
  tasks: Task[],
  limit = 200,
): { tasks: TaskView[]; counts: TaskCounts } => {
  const views = tasks.map(taskToView)
  views.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const limited = views.slice(0, Math.max(0, limit))
  const counts = initCounts()
  for (const view of limited) counts[view.status] += 1
  return { tasks: limited, counts }
}
