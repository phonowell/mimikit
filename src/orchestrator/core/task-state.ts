import type { Task, WorkerProfile, WorkerProvider } from '../../types/index.js'

export type TaskFingerprintInput = {
  prompt: string
  title: string
  profile: WorkerProfile
  provider: WorkerProvider
  focusId?: string
  schedule?: string
}

const normalizeFingerprintPart = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toLowerCase()

const normalizeSemanticPart = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const buildTaskSemanticKey = (input: TaskFingerprintInput): string => {
  const prompt = normalizeSemanticPart(input.prompt).slice(0, 180)
  const title = normalizeSemanticPart(input.title).slice(0, 96)
  const focusId = normalizeSemanticPart(input.focusId ?? '')
  const schedule = normalizeSemanticPart(input.schedule ?? '')
  return [input.profile, input.provider, focusId, title, prompt, schedule].join(
    '\n',
  )
}

export const buildTaskFingerprint = (input: TaskFingerprintInput): string =>
  [
    normalizeFingerprintPart(input.prompt),
    normalizeFingerprintPart(input.title),
    input.profile,
    input.provider,
    normalizeFingerprintPart(input.focusId ?? ''),
    normalizeFingerprintPart(input.schedule ?? ''),
  ].join('\n')

export const isActiveTask = (task: Task): boolean =>
  task.status === 'pending' ||
  task.status === 'paused' ||
  task.status === 'running'

export const taskToFingerprintInput = (
  task: Pick<
    Task,
    | 'prompt'
    | 'title'
    | 'profile'
    | 'provider'
    | 'focusId'
    | 'cron'
    | 'scheduledAt'
  >,
): TaskFingerprintInput => ({
  prompt: task.prompt,
  title: task.title,
  profile: task.profile,
  provider: task.provider,
  focusId: task.focusId,
  ...(task.cron
    ? { schedule: task.cron }
    : task.scheduledAt
      ? { schedule: task.scheduledAt }
      : {}),
})

export const findActiveTaskBySemanticKey = (
  tasks: Task[],
  semanticKey: string,
): Task | undefined =>
  tasks.find(
    (task) =>
      isActiveTask(task) &&
      buildTaskSemanticKey(taskToFingerprintInput(task)) === semanticKey,
  )
