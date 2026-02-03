import { newId } from '../ids.js'
import { nowIso } from '../time.js'

import type { Task } from '../types/tasks.js'

export const createTask = (prompt: string): Task => ({
  id: newId(),
  prompt,
  status: 'pending',
  createdAt: nowIso(),
})

export const enqueueTask = (tasks: Task[], prompt: string): Task => {
  const task = createTask(prompt)
  tasks.push(task)
  return task
}

export const markTaskDone = (tasks: Task[], taskId: string): Task | null => {
  const task = tasks.find((item) => item.id === taskId)
  if (!task) return null
  task.status = 'done'
  return task
}

export const pickNextPendingTask = (
  tasks: Task[],
  running: Set<string>,
): Task | null => {
  for (const task of tasks) {
    if (task.status !== 'pending') continue
    if (running.has(task.id)) continue
    return task
  }
  return null
}
