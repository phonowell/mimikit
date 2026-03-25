import {
  newId,
  nowIso,
  titleFromCandidates,
} from '../../foundation/shared/utils.js'
import { GLOBAL_FOCUS_ID } from '../focus/index.js'
import { resolveTaskResourceMode } from '../shared/task-resource-mode.js'
import { persistTaskExecutionSpec } from '../spec/store.js'

import { buildTaskGitExecution } from './task-git-execution.js'
import {
  buildTaskFingerprint,
  buildTaskSemanticKey,
  isActiveTask,
} from './task-state.js'

import type {
  FocusId,
  Task,
  TaskContract,
  TaskResourceMode,
  WorkerProfile,
  WorkerProvider,
} from '../../foundation/types/index.js'

export type EnqueueTaskResult = { task: Task; created: boolean }

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
  stateDir: string,
  prompt: string,
  title?: string,
  cwd?: string,
  profile: WorkerProfile = 'worker',
  provider: WorkerProvider = 'codex',
  focusId: FocusId = GLOBAL_FOCUS_ID,
  repoKey?: string,
  branch?: string,
  resourceMode?: TaskResourceMode,
  contract?: TaskContract,
): Promise<Task> => {
  const id = `task-${newId()}`
  const resolvedTitle = resolveTitle(id, prompt, title)
  if (!cwd?.trim()) throw new Error('task cwd is required')
  const normalizedResourceMode = resolveTaskResourceMode(resourceMode)
  const git = buildTaskGitExecution(cwd, branch)
  const fingerprint = buildTaskFingerprint({
    prompt,
    title: resolvedTitle,
    cwd,
    resourceMode: normalizedResourceMode,
    profile,
    provider,
    focusId,
    ...(repoKey ? { repoKey } : {}),
    ...(branch ? { branch } : {}),
    ...(contract ? { contract } : {}),
  })
  const semanticKey = buildTaskSemanticKey({
    prompt,
    title: resolvedTitle,
    cwd,
    resourceMode: normalizedResourceMode,
    profile,
    provider,
    focusId,
    ...(repoKey ? { repoKey } : {}),
    ...(branch ? { branch } : {}),
    ...(contract ? { contract } : {}),
  })
  return persistTaskExecutionSpec({
    stateDir,
    prompt,
    ...(contract ? { contract } : {}),
  }).then((spec) => ({
    id,
    fingerprint,
    semanticKey,
    executionSpecId: spec.id,
    title: resolvedTitle,
    cwd,
    resourceMode: normalizedResourceMode,
    ...(repoKey ? { repoKey } : {}),
    ...(branch ? { branch } : {}),
    ...(git ? { git } : {}),
    profile,
    provider,
    status: 'pending',
    createdAt: nowIso(),
    focusId,
  }))
}

export const enqueueTask = (
  stateDir: string,
  tasks: Task[],
  prompt: string,
  title?: string,
  cwd?: string,
  profile: WorkerProfile = 'worker',
  provider: WorkerProvider = 'codex',
  focusId: FocusId = GLOBAL_FOCUS_ID,
  repoKey?: string,
  branch?: string,
  resourceMode?: TaskResourceMode,
  contract?: TaskContract,
): Promise<EnqueueTaskResult> => {
  if (!cwd?.trim()) throw new Error('task cwd is required')
  const normalizedResourceMode = resolveTaskResourceMode(resourceMode)
  const fingerprint = buildTaskFingerprint({
    prompt,
    title: resolveFingerprintTitle(prompt, title),
    cwd,
    resourceMode: normalizedResourceMode,
    profile,
    provider,
    focusId,
    ...(repoKey ? { repoKey } : {}),
    ...(branch ? { branch } : {}),
    ...(contract ? { contract } : {}),
  })
  const existing = tasks.find(
    (task) => isActiveTask(task) && task.fingerprint === fingerprint,
  )
  if (existing) return Promise.resolve({ task: existing, created: false })
  return createTask(
    stateDir,
    prompt,
    title,
    cwd,
    profile,
    provider,
    focusId,
    repoKey,
    branch,
    normalizedResourceMode,
    contract,
  ).then((task) => {
    tasks.push(task)
    return { task, created: true }
  })
}
