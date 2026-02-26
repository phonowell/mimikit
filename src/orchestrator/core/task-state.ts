import type { Task, WorkerProfile } from '../../types/index.js'

export type TaskFingerprintInput = {
  prompt: string
  title: string
  profile: WorkerProfile
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
  const schedule = normalizeSemanticPart(input.schedule ?? '')
  return [input.profile, title, prompt, schedule].join('\n')
}

export const buildTaskFingerprint = (input: TaskFingerprintInput): string =>
  [
    normalizeFingerprintPart(input.prompt),
    normalizeFingerprintPart(input.title),
    input.profile,
    normalizeFingerprintPart(input.schedule ?? ''),
  ].join('\n')

const isActiveTask = (task: Task): boolean =>
  task.status === 'pending' || task.status === 'running'

const taskToFingerprintInput = (
  task: Pick<Task, 'prompt' | 'title' | 'profile' | 'cron'>,
): TaskFingerprintInput => ({
  prompt: task.prompt,
  title: task.title,
  profile: task.profile,
  ...(task.cron ? { schedule: task.cron } : {}),
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
