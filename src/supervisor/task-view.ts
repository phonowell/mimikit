import { listTasks } from '../storage/tasks.js'
import { titleFromCandidates } from '../tasks/summary.js'

import type { StatePaths } from '../fs/paths.js'
import type { Task, TaskStatus } from '../types/tasks.js'

export type TaskView = {
  id: string
  status: TaskStatus
  title: string
  createdAt: string
  priority: number
  blockedBy?: string[]
  scheduledAt?: string
}

export type TaskCounts = Record<TaskStatus, number>

const initCounts = (): TaskCounts => ({
  queued: 0,
  running: 0,
  done: 0,
  failed: 0,
  cancelled: 0,
  timeout: 0,
})

const taskToView = (task: Task): TaskView => ({
  id: task.id,
  status: task.status,
  title: titleFromCandidates(task.id, [task.prompt]),
  createdAt: task.createdAt,
  priority: task.priority,
  ...(task.blockedBy ? { blockedBy: task.blockedBy } : {}),
  ...(task.scheduledAt ? { scheduledAt: task.scheduledAt } : {}),
})

export const buildTaskViews = async (
  paths: StatePaths,
  limit = 200,
): Promise<{ tasks: TaskView[]; counts: TaskCounts }> => {
  const tasks = await listTasks(paths.agentQueue)
  const views = tasks.map(taskToView)
  views.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const limited = views.slice(0, Math.max(0, limit))
  const counts = initCounts()
  for (const view of limited) counts[view.status] += 1
  return { tasks: limited, counts }
}
