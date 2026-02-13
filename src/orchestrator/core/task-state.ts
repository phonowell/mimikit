import { newId, nowIso, titleFromCandidates } from '../../shared/utils.js'

import type {
  Task,
  TaskNextDef,
  TaskStatus,
  WorkerProfile,
} from '../../types/index.js'

export type EnqueueTaskResult = {
  task: Task
  created: boolean
}

export const buildTaskFingerprint = (prompt: string): string =>
  prompt.trim().replace(/\s+/g, ' ').toLowerCase()

const isActiveTask = (task: Task): boolean =>
  task.status === 'pending' || task.status === 'running'

const resolveTitle = (id: string, prompt: string, title?: string): string =>
  titleFromCandidates(id, [title, prompt])

export const createTask = (
  prompt: string,
  title?: string,
  profile: WorkerProfile = 'standard',
  next?: TaskNextDef[],
): Task => {
  const id = newId()
  return {
    id,
    fingerprint: buildTaskFingerprint(prompt),
    prompt,
    title: resolveTitle(id, prompt, title),
    profile,
    status: 'pending',
    createdAt: nowIso(),
    ...(next !== undefined ? { next } : {}),
  }
}

export const enqueueTask = (
  tasks: Task[],
  prompt: string,
  title?: string,
  profile: WorkerProfile = 'standard',
  next?: TaskNextDef[],
): EnqueueTaskResult => {
  const fingerprint = buildTaskFingerprint(prompt)
  const existing = tasks.find(
    (task) => task.fingerprint === fingerprint && isActiveTask(task),
  )
  if (existing) return { task: existing, created: false }
  const task = createTask(prompt, title, profile, next)
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
