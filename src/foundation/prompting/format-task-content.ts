import {
  escapeCdata,
  parseIsoToMs,
  stringifyPromptJson,
} from './format-base.js'
import {
  buildResultPromptPayload,
  pickArchivePath,
} from './format-task-result-payload.js'
import {
  formatTaskPromptCard,
  formatTaskPromptEntry,
} from './task-prompt-entry-format.js'
import {
  buildTaskPromptEntries,
  type PromptSelectionSummary,
  selectTasksForPrompt,
  type TaskPromptPayloadOptions,
} from './task-prompt-selection.js'

import type { Task, TaskResult } from '../types/index.js'

export {
  selectTasksForPrompt,
  type PromptSelectionSummary,
  type TaskPromptPayloadOptions,
}

export const buildTasksPromptPayloadSection = (
  tasks: Task[],
  results: TaskResult[],
  workDir?: string,
  options?: TaskPromptPayloadOptions,
): {
  payload?: { tasks: Record<string, unknown>[] } | undefined
  selection: PromptSelectionSummary
} => {
  const { entries, selection } = buildTaskPromptEntries({
    tasks,
    results,
    ...(workDir ? { workDir } : {}),
    ...(options ? { options } : {}),
    formatExpanded: (task, result) =>
      formatTaskPromptEntry(task, result, workDir),
    formatCard: (task, result) => formatTaskPromptCard(task, result, workDir),
  })

  return {
    payload: entries.length === 0 ? undefined : { tasks: entries },
    selection,
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
