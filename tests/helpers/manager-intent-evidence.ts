import type {
  ManagerActionFeedback,
  Task,
  UserInput,
} from '../../src/foundation/types/index.js'

export const createIntentEvidenceUserInput = (text: string): UserInput => ({
  id: 'input-user',
  role: 'user',
  text,
  createdAt: '2026-03-20T08:00:00.000Z',
  focusId: 'focus-inbox',
})

export const createIntentEvidenceTask = (
  overrides: Partial<Task> = {},
): Task => ({
  id: 'task-refactor-auth',
  fingerprint: 'task-refactor-auth-fingerprint',
  prompt: 'Refactor auth guard',
  title: 'Refactor auth guard',
  cwd: '/repo/auth-guard',
  focusId: 'focus-inbox',
  profile: 'worker',
  provider: 'codex',
  status: 'running',
  createdAt: '2026-03-20T08:00:00.000Z',
  ...overrides,
})

export const createIntentEvidenceTaskContext = (
  task: Task,
  inputs: UserInput[],
): {
  stateDir?: string
  inputs: UserInput[]
  taskStatusById: Map<string, Task['status']>
  taskById: Map<string, Task>
  supplementalEvidenceSources: Set<'task_result'>
} => ({
  inputs,
  taskStatusById: new Map([[task.id, task.status]]),
  taskById: new Map([[task.id, task]]),
  supplementalEvidenceSources: new Set(['task_result']),
})

export const expectSingleRejectedFeedback = (
  feedback: ManagerActionFeedback[],
  params: {
    action: string
    error?: string
    hintIncludes: string[]
  },
): void => {
  if (feedback.length !== 1)
    throw new Error(`expected 1 feedback item, got ${feedback.length}`)
  const item = feedback[0]
  if (!item) throw new Error('expected feedback item')
  if (item.action !== params.action)
    throw new Error(`expected action ${params.action}, got ${item.action}`)
  if (params.error !== undefined && item.error !== params.error)
    throw new Error(`expected error ${params.error}, got ${item.error}`)
  for (const fragment of params.hintIncludes) {
    if (!item.hint.includes(fragment))
      throw new Error(`expected hint to include ${fragment}`)
  }
}
