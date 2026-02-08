import { resolveTaskChangedAt } from '../prompts/format-base.js'

import type { TaskStatusSummary } from '../contracts/channels.js'
import type { Task } from '../types/index.js'

const statusCounts = (tasks: Task[]): Omit<TaskStatusSummary, 'recent'> => ({
  pending: tasks.filter((task) => task.status === 'pending').length,
  running: tasks.filter((task) => task.status === 'running').length,
  succeeded: tasks.filter((task) => task.status === 'succeeded').length,
  failed: tasks.filter((task) => task.status === 'failed').length,
  canceled: tasks.filter((task) => task.status === 'canceled').length,
})

const sortByChangedAt = (tasks: Task[]): Task[] =>
  [...tasks].sort((left, right) => {
    const leftAt = Date.parse(resolveTaskChangedAt(left))
    const rightAt = Date.parse(resolveTaskChangedAt(right))
    if (leftAt !== rightAt) return rightAt - leftAt
    return left.id.localeCompare(right.id)
  })

export const buildTaskStatusSummary = (
  tasks: Task[],
  recentLimit = 12,
): TaskStatusSummary => {
  const recent = sortByChangedAt(tasks)
    .slice(0, recentLimit)
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      profile: task.profile,
      changedAt: resolveTaskChangedAt(task),
    }))
  return {
    ...statusCounts(tasks),
    recent,
  }
}
