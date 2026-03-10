import { GLOBAL_FOCUS_ID } from '../../focus/index.js'
import { newId, nowIso, titleFromCandidates } from '../../shared/utils.js'

import {
  buildTaskFingerprint,
  isActiveTask,
  taskToFingerprintInput,
} from './task-state.js'

import type {
  FocusId,
  Task,
  TaskContract,
  TaskStatus,
  WorkerProfile,
  WorkerProvider,
} from '../../types/index.js'

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

export const createTask = (
  prompt: string,
  title?: string,
  cwd?: string,
  profile: WorkerProfile = 'worker',
  provider: WorkerProvider = 'codex',
  schedule?: string,
  focusId: FocusId = GLOBAL_FOCUS_ID,
  repoKey?: string,
  branch?: string,
  contract?: TaskContract,
): Task => {
  const id = `task-${newId()}`
  const resolvedTitle = resolveTitle(id, prompt, title)
  if (!cwd?.trim()) throw new Error('task cwd is required')
  return {
    id,
    fingerprint: buildTaskFingerprint({
      prompt,
      title: resolvedTitle,
      cwd,
      profile,
      provider,
      focusId,
      ...(schedule ? { schedule } : {}),
      ...(repoKey ? { repoKey } : {}),
      ...(branch ? { branch } : {}),
      ...(contract ? { contract } : {}),
    }),
    prompt,
    title: resolvedTitle,
    cwd,
    ...(repoKey ? { repoKey } : {}),
    ...(branch ? { branch } : {}),
    ...(contract ? { contract } : {}),
    ...(schedule ? { cron: schedule } : {}),
    profile,
    provider,
    status: 'pending',
    createdAt: nowIso(),
    focusId,
  }
}

export const enqueueTask = (
  tasks: Task[],
  prompt: string,
  title?: string,
  cwd?: string,
  profile: WorkerProfile = 'worker',
  provider: WorkerProvider = 'codex',
  schedule?: string,
  focusId: FocusId = GLOBAL_FOCUS_ID,
  repoKey?: string,
  branch?: string,
  contract?: TaskContract,
): EnqueueTaskResult => {
  if (!cwd?.trim()) throw new Error('task cwd is required')
  const fingerprint = buildTaskFingerprint({
    prompt,
    title: resolveFingerprintTitle(prompt, title),
    cwd,
    profile,
    provider,
    focusId,
    ...(schedule ? { schedule } : {}),
    ...(repoKey ? { repoKey } : {}),
    ...(branch ? { branch } : {}),
    ...(contract ? { contract } : {}),
  })
  const existing = tasks.find(
    (task) =>
      isActiveTask(task) &&
      buildTaskFingerprint(taskToFingerprintInput(task)) === fingerprint,
  )
  if (existing) return { task: existing, created: false }
  const task = createTask(
    prompt,
    title,
    cwd,
    profile,
    provider,
    schedule,
    focusId,
    repoKey,
    branch,
    contract,
  )
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
  if (status !== 'paused') delete task.pausedAt
  return task
}

const findTaskById = (tasks: Task[], taskId: string): Task | undefined =>
  tasks.find((item) => item.id === taskId)

export const markTaskRunning = (
  tasks: Task[],
  taskId: string,
  patch?: Partial<Task>,
): Task | null =>
  updateTaskStatus(tasks, taskId, 'running', {
    ...patch,
    startedAt: patch?.startedAt ?? nowIso(),
  })

export const markTaskPaused = (
  tasks: Task[],
  taskId: string,
  patch?: Partial<Task>,
): Task | null => {
  const task = updateTaskStatus(tasks, taskId, 'paused', {
    ...patch,
    pausedAt: patch?.pausedAt ?? nowIso(),
  })
  if (!task) return null
  delete task.startedAt
  return task
}

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
  const task = findTaskById(tasks, taskId)
  if (!task) return null
  task.status = 'canceled'
  Object.assign(task, {
    ...patch,
    ...(task.completedAt ? { completedAt: task.completedAt } : {}),
    ...(task.durationMs !== undefined ? { durationMs: task.durationMs } : {}),
  })
  delete task.pausedAt
  return task
}
