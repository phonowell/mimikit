import { toDisplayPath } from '../../surface/shared/path-display.js'
import { resolveTaskLabel } from '../../work/shared/task-state.js'

import {
  escapeCdata,
  parseIsoToMs,
  resolveTaskChangedAt,
  sortTasksByChangedAt,
  stringifyPromptJson,
} from './format-base.js'
import {
  buildResultPromptPayload,
  pickArchivePath,
} from './format-task-result-payload.js'

import type {
  Task,
  TaskCancelMeta,
  TaskContract,
  TaskResult,
} from '../types/index.js'

export type TaskPromptPayloadOptions = {
  workingFocusIds?: string[] | undefined
  latestResultTaskId?: string | undefined
}

export type PromptSelectionSummary = {
  selected: number
  full: number
  card: number
}

export const selectTasksForPrompt = (tasks: Task[]): Task[] =>
  sortTasksByChangedAt(tasks)

const toCancelMeta = (
  cancel?: TaskCancelMeta,
): Record<string, unknown> | undefined =>
  cancel
    ? {
        source: cancel.source,
        ...(cancel.reason ? { reason: cancel.reason } : {}),
      }
    : undefined

const toContractPayload = (
  contract?: TaskContract,
): Record<string, unknown> | undefined => {
  if (!contract) return undefined
  return {
    goal: contract.goal,
    scope: contract.scope,
    acceptance: contract.acceptance,
    ...(contract.outOfScope ? { out_of_scope: contract.outOfScope } : {}),
    ...(contract.contextRefs ? { context_refs: contract.contextRefs } : {}),
  }
}

const formatTaskEntry = (
  task: Task,
  result: TaskResult | undefined,
  workDir?: string,
): Record<string, unknown> => {
  const archivePath = pickArchivePath(
    result?.archivePath,
    task.archivePath,
    workDir,
  )
  return {
    ...(archivePath ? { archive_path: archivePath } : {}),
    id: task.id,
    status: task.status,
    ...(toContractPayload(task.contract)
      ? { contract: toContractPayload(task.contract) }
      : {}),
    resource_mode: task.resourceMode ?? 'write',
    provider: task.provider,
    cwd: toDisplayPath(task.cwd, workDir),
    ...(task.repoKey ? { repo_key: task.repoKey } : {}),
    ...(task.branch ? { branch: task.branch } : {}),
    ...(task.git
      ? {
          git: {
            worktree_path: toDisplayPath(task.git.worktreePath, workDir),
            branch: task.git.branch,
          },
        }
      : {}),
    title: resolveTaskLabel(task),
    changed_at: resolveTaskChangedAt(task),
    ...(task.status === 'canceled' && task.cancel
      ? { cancel: toCancelMeta(task.cancel) }
      : {}),
  }
}

export const buildTasksPromptPayloadSection = (
  tasks: Task[],
  results: TaskResult[],
  workDir?: string,
  _options?: TaskPromptPayloadOptions,
): {
  payload?: { tasks: Record<string, unknown>[] } | undefined
  selection: PromptSelectionSummary
} => {
  if (tasks.length === 0)
    return { payload: undefined, selection: { selected: 0, full: 0, card: 0 } }

  const resultById = new Map(results.map((result) => [result.taskId, result]))
  const orderedTasks = selectTasksForPrompt(tasks)
  const entries = orderedTasks.map((task) =>
    formatTaskEntry(task, resultById.get(task.id), workDir),
  )

  return {
    payload: entries.length === 0 ? undefined : { tasks: entries },
    selection: { selected: entries.length, full: entries.length, card: 0 },
  }
}

export const buildTasksPromptPayload = (
  tasks: Task[],
  results: TaskResult[],
  workDir?: string,
  options?: TaskPromptPayloadOptions,
): { tasks: Record<string, unknown>[] } | undefined =>
  buildTasksPromptPayloadSection(tasks, results, workDir, options).payload

export const formatTasksJson = (
  tasks: Task[],
  results: TaskResult[],
  workDir?: string,
): string => {
  const payload = buildTasksPromptPayload(tasks, results, workDir)
  if (!payload) return ''
  return escapeCdata(stringifyPromptJson(payload))
}

export const buildResultsPromptPayload = (
  tasks: Task[],
  results: TaskResult[],
  workDir?: string,
): { tasks: Record<string, unknown>[] } | undefined => {
  if (results.length === 0) return undefined

  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const latestByTaskId = new Map<string, TaskResult>()
  for (const result of results) {
    const existing = latestByTaskId.get(result.taskId)
    if (
      !existing ||
      parseIsoToMs(result.completedAt) >= parseIsoToMs(existing.completedAt)
    )
      latestByTaskId.set(result.taskId, result)
  }

  const entries = Array.from(latestByTaskId.values())
    .sort(
      (a, b) =>
        parseIsoToMs(b.completedAt) - parseIsoToMs(a.completedAt) ||
        a.taskId.localeCompare(b.taskId),
    )
    .map((result) => {
      const task = taskById.get(result.taskId)
      const archivePath = pickArchivePath(
        result.archivePath,
        task?.archivePath,
        workDir,
      )
      return {
        id: result.taskId,
        provider: task?.provider ?? result.provider ?? 'codex',
        title: task?.title.trim() ?? result.title?.trim() ?? result.taskId,
        changed_at: result.completedAt,
        ...(archivePath ? { archive_path: archivePath } : {}),
        result: buildResultPromptPayload(
          result,
          result.cancel ?? task?.cancel,
          task?.archivePath,
          workDir,
        ),
      }
    })

  return entries.length === 0 ? undefined : { tasks: entries }
}

export const formatResultsJson = (
  tasks: Task[],
  results: TaskResult[],
  workDir?: string,
): string => {
  const payload = buildResultsPromptPayload(tasks, results, workDir)
  if (!payload) return ''
  return escapeCdata(stringifyPromptJson(payload))
}
