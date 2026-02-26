import { GLOBAL_FOCUS_ID } from '../../focus/index.js'
import { newId, nowIso, titleFromCandidates } from '../../shared/utils.js'

import { buildTaskFingerprint } from './task-state.js'

import type { FocusId, Task, TaskStatus, WorkerProfile } from '../../types/index.js'

export type EnqueueTaskResult = {
  task: Task
  created: boolean
}

const resolveTitle = (id: string, prompt: string, title?: string): string =>
  titleFromCandidates(id, [title, prompt])

const resolveFingerprintTitle = (prompt: string, title?: string): string => {
  const normalizedTitle = title?.trim()
  if (normalizedTitle) return normalizedTitle
  const normalizedPrompt = prompt.trim()
  if (normalizedPrompt) return normalizedPrompt
  return prompt
}

const isActiveTask = (task: Task): boolean =>
  task.status === 'pending' || task.status === 'running'

type TaskFingerprintInput = Pick<Task, 'prompt' | 'title' | 'profile' | 'cron'>

const taskToFingerprintInput = (task: TaskFingerprintInput) => ({
  prompt: task.prompt,
  title: task.title,
  profile: task.profile,
  ...(task.cron ? { schedule: task.cron } : {}),
})

export const createTask = (
  prompt: string,
  title?: string,
  profile: WorkerProfile = 'worker',
  schedule?: string,
  focusId: FocusId = GLOBAL_FOCUS_ID,
): Task => {
  const id = `task-${newId()}`
  const resolvedTitle = resolveTitle(id, prompt, title)
  return {
    id,
    fingerprint: buildTaskFingerprint({
      prompt,
      title: resolvedTitle,
      profile,
      ...(schedule ? { schedule } : {}),
    }),
    prompt,
    title: resolvedTitle,
    ...(schedule ? { cron: schedule } : {}),
    profile,
    status: 'pending',
    createdAt: nowIso(),
    focusId,
  }
}

export const enqueueTask = (
  tasks: Task[],
  prompt: string,
  title?: string,
  profile: WorkerProfile = 'worker',
  schedule?: string,
  focusId: FocusId = GLOBAL_FOCUS_ID,
): EnqueueTaskResult => {
  const fingerprint = buildTaskFingerprint({
    prompt,
    title: resolveFingerprintTitle(prompt, title),
    profile,
    ...(schedule ? { schedule } : {}),
  })
  const existing = tasks.find(
    (task) =>
      isActiveTask(task) &&
      buildTaskFingerprint(taskToFingerprintInput(task)) === fingerprint,
  )
  if (existing) return { task: existing, created: false }
  const task = createTask(prompt, title, profile, schedule, focusId)
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
  task.status = 'canceled'
  Object.assign(task, {
    ...patch,
    ...(task.completedAt ? { completedAt: task.completedAt } : {}),
    ...(task.durationMs !== undefined ? { durationMs: task.durationMs } : {}),
  })
  return task
}
