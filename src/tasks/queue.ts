import { newId } from '../ids.js'
import { nowIso } from '../time.js'

import { titleFromCandidates } from './summary.js'

import type { Task, TaskStatus } from '../types/tasks.js'

const resolveTitle = (id: string, prompt: string, title?: string): string =>
  titleFromCandidates(id, [title, prompt])

export const createTask = (prompt: string, title?: string): Task => {
  const id = newId()
  return {
    id,
    prompt,
    title: resolveTitle(id, prompt, title),
    status: 'pending',
    createdAt: nowIso(),
  }
}

export const enqueueTask = (
  tasks: Task[],
  prompt: string,
  title?: string,
): Task => {
  const task = createTask(prompt, title)
  tasks.push(task)
  return task
}

const updateTaskStatus = (
  tasks: Task[],
  taskId: string,
  status: TaskStatus,
): Task | null => {
  const task = tasks.find((item) => item.id === taskId)
  if (!task) return null
  task.status = status
  return task
}

export const markTaskRunning = (tasks: Task[], taskId: string): Task | null =>
  updateTaskStatus(tasks, taskId, 'running')

export const markTaskSucceeded = (tasks: Task[], taskId: string): Task | null =>
  updateTaskStatus(tasks, taskId, 'succeeded')

export const markTaskFailed = (tasks: Task[], taskId: string): Task | null =>
  updateTaskStatus(tasks, taskId, 'failed')

export const markTaskCanceled = (tasks: Task[], taskId: string): Task | null =>
  updateTaskStatus(tasks, taskId, 'canceled')

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
