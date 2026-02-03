import { titleFromCandidates } from '../tasks/summary.js'

import type { Task, TaskStatus } from '../types/tasks.js'

export type TaskView = {
  id: string
  status: TaskStatus
  title: string
  createdAt: string
}

export type TaskCounts = Record<TaskStatus, number>

const initCounts = (): TaskCounts => ({
  done: 0,
  pending: 0,
})

const taskToView = (task: Task): TaskView => ({
  id: task.id,
  status: task.status,
  title: titleFromCandidates(task.id, [task.prompt]),
  createdAt: task.createdAt,
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
