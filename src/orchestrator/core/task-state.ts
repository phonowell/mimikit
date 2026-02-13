import { newId, nowIso, titleFromCandidates } from '../../shared/utils.js'

import type { Task, TaskStatus, WorkerProfile } from '../../types/index.js'

export type EnqueueTaskResult = {
  task: Task
  created: boolean
}

export type TaskFingerprintInput = {
  prompt: string
  title: string
  profile: WorkerProfile
  schedule?: string
}

const normalizeFingerprintPart = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toLowerCase()

export const buildTaskFingerprint = (input: TaskFingerprintInput): string =>
  [
    normalizeFingerprintPart(input.prompt),
    normalizeFingerprintPart(input.title),
    input.profile,
    normalizeFingerprintPart(input.schedule ?? ''),
  ].join('\n')

const isActiveTask = (task: Task): boolean =>
  task.status === 'pending' || task.status === 'running'

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
  profile: WorkerProfile = 'standard',
  schedule?: string,
): Task => {
  const id = newId()
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
  }
}

export const enqueueTask = (
  tasks: Task[],
  prompt: string,
  title?: string,
  profile: WorkerProfile = 'standard',
  schedule?: string,
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
      buildTaskFingerprint({
        prompt: task.prompt,
        title: task.title,
        profile: task.profile,
        ...(task.cron ? { schedule: task.cron } : {}),
      }) === fingerprint,
  )
  if (existing) return { task: existing, created: false }
  const task = createTask(prompt, title, profile, schedule)
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
