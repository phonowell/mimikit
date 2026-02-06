import { newId, nowIso } from '../shared/utils.js'

import type { Task, TaskStatus } from '../types/index.js'

export type EnqueueTaskResult = {
  task: Task
  created: boolean
}

export const summarizeLine = (text?: string, limit = 120): string => {
  if (!text) return ''
  const line =
    text
      .split('\n')
      .find((item) => item.trim())
      ?.trim() ?? ''
  if (!line) return ''
  if (line.length <= limit) return line
  const head = Math.max(0, limit - 3)
  return `${line.slice(0, head)}...`
}

export const summaryFromCandidates = (
  candidates: Array<string | undefined>,
  limit = 120,
): string | undefined => {
  for (const candidate of candidates) {
    const summary = summarizeLine(candidate, limit)
    if (summary) return summary
  }
  return undefined
}

export const titleFromCandidates = (
  id: string,
  candidates: Array<string | undefined>,
  limit = 48,
): string => summaryFromCandidates(candidates, limit) ?? id

const resolveTitle = (id: string, prompt: string, title?: string): string =>
  titleFromCandidates(id, [title, prompt])

export const buildTaskFingerprint = (prompt: string): string =>
  prompt.trim().replace(/\s+/g, ' ').toLowerCase()

const isActiveTask = (task: Task): boolean =>
  task.status === 'pending' || task.status === 'running'

export const createTask = (prompt: string, title?: string): Task => {
  const id = newId()
  return {
    id,
    fingerprint: buildTaskFingerprint(prompt),
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
): EnqueueTaskResult => {
  const fingerprint = buildTaskFingerprint(prompt)
  const existing = tasks.find(
    (task) => task.fingerprint === fingerprint && isActiveTask(task),
  )
  if (existing) return { task: existing, created: false }
  const task = createTask(prompt, title)
  tasks.push(task)
  return { task, created: true }
}

const updateTaskStatus = (
  tasks: Task[],
  taskId: string,
  status: TaskStatus,
  patch?: Partial<Task>,
): Task | null => {
  const task = tasks.find((item) => item.id === taskId)
  if (!task) return null
  task.status = status
  if (patch) Object.assign(task, patch)
  return task
}

export const markTaskRunning = (
  tasks: Task[],
  taskId: string,
  patch?: Partial<Task>,
): Task | null =>
  updateTaskStatus(tasks, taskId, 'running', {
    ...patch,
    startedAt: patch?.startedAt ?? nowIso(),
  })

export const markTaskSucceeded = (
  tasks: Task[],
  taskId: string,
  patch?: Partial<Task>,
): Task | null => updateTaskStatus(tasks, taskId, 'succeeded', patch)

export const markTaskFailed = (
  tasks: Task[],
  taskId: string,
  patch?: Partial<Task>,
): Task | null => updateTaskStatus(tasks, taskId, 'failed', patch)

export const markTaskCanceled = (
  tasks: Task[],
  taskId: string,
  patch?: Partial<Task>,
): Task | null => {
  const task = tasks.find((item) => item.id === taskId)
  if (!task) return null
  const nextPatch: Partial<Task> = { ...patch }
  if (task.completedAt) nextPatch.completedAt = task.completedAt
  if (task.durationMs !== undefined) nextPatch.durationMs = task.durationMs
  return updateTaskStatus(tasks, taskId, 'canceled', nextPatch)
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
