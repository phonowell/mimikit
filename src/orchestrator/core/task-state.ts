import type {
  Task,
  TaskContract,
  WorkerProfile,
  WorkerProvider,
} from '../../types/index.js'

export type TaskFingerprintInput = {
  prompt: string
  title: string
  cwd: string
  profile: WorkerProfile
  provider: WorkerProvider
  focusId?: string
  repoKey?: string
  branch?: string
  contract?: TaskContract
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

const normalizeContractLines = (
  contract?: TaskContract,
): { fingerprint: string; semantic: string } => {
  if (!contract) return { fingerprint: '', semantic: '' }
  const acceptance = contract.acceptance
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  const contextRefs = (contract.contextRefs ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  const lines = [
    contract.goal.trim(),
    contract.scope.trim(),
    ...acceptance,
    contract.outOfScope?.trim() ?? '',
    ...contextRefs,
  ].filter((item) => item.length > 0)
  const joined = lines.join('\n')
  return {
    fingerprint: normalizeFingerprintPart(joined),
    semantic: normalizeSemanticPart(joined),
  }
}

export const buildTaskSemanticKey = (input: TaskFingerprintInput): string => {
  const prompt = normalizeSemanticPart(input.prompt).slice(0, 180)
  const title = normalizeSemanticPart(input.title).slice(0, 96)
  const cwd = normalizeSemanticPart(input.cwd)
  const focusId = normalizeSemanticPart(input.focusId ?? '')
  const repoKey = normalizeSemanticPart(input.repoKey ?? '')
  const branch = normalizeSemanticPart(input.branch ?? '')
  return [
    input.profile,
    input.provider,
    focusId,
    title,
    prompt,
    repoKey,
    branch,
    cwd,
  ].join('\n')
}

export const buildTaskFingerprint = (input: TaskFingerprintInput): string =>
  (() => {
    const contract = normalizeContractLines(input.contract).fingerprint
    return [
      normalizeFingerprintPart(input.prompt),
      normalizeFingerprintPart(input.title),
      normalizeFingerprintPart(input.cwd),
      input.profile,
      input.provider,
      normalizeFingerprintPart(input.focusId ?? ''),
      normalizeFingerprintPart(input.repoKey ?? ''),
      normalizeFingerprintPart(input.branch ?? ''),
      contract,
    ].join('\n')
  })()

export const isActiveTask = (task: Task): boolean =>
  task.status === 'pending' ||
  task.status === 'paused' ||
  task.status === 'running'

export const taskToFingerprintInput = (
  task: Pick<
    Task,
    | 'prompt'
    | 'title'
    | 'cwd'
    | 'repoKey'
    | 'branch'
    | 'profile'
    | 'provider'
    | 'focusId'
    | 'contract'
  >,
): TaskFingerprintInput => ({
  prompt: task.prompt,
  title: task.title,
  cwd: task.cwd,
  ...(task.repoKey ? { repoKey: task.repoKey } : {}),
  ...(task.branch ? { branch: task.branch } : {}),
  profile: task.profile,
  provider: task.provider,
  focusId: task.focusId,
  ...(task.contract ? { contract: task.contract } : {}),
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
