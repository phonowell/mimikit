import {
  escapeCdata,
  normalizeYamlUsage,
  parseIsoToMs,
  resolveTaskChangedAt,
  stringifyPromptYaml,
} from './format-base.js'

import type { Task, TaskCancelMeta, TaskResult } from '../types/index.js'

export const selectTasksForPrompt = (tasks: Task[]): Task[] => {
  if (tasks.length === 0) return []
  return [...tasks].sort((a, b) => {
    const aTs = parseIsoToMs(resolveTaskChangedAt(a))
    const bTs = parseIsoToMs(resolveTaskChangedAt(b))
    if (aTs !== bTs) return bTs - aTs
    return a.id.localeCompare(b.id)
  })
}

const formatCancelMeta = (
  cancel?: TaskCancelMeta,
): Record<string, unknown> | undefined =>
  cancel
    ? {
        source: cancel.source,
        ...(cancel.reason ? { reason: cancel.reason } : {}),
      }
    : undefined

const formatTaskEntry = (
  task: Task,
  result: TaskResult | undefined,
): Record<string, unknown> => {
  const taskCancel = formatCancelMeta(task.cancel)
  const resultCancel = formatCancelMeta(result?.cancel ?? task.cancel)
  return {
    id: task.id,
    status: task.status,
    title: task.title.trim() || task.id,
    changed_at: resolveTaskChangedAt(task),
    prompt: task.prompt,
    ...(task.status === 'canceled' && taskCancel ? { cancel: taskCancel } : {}),
    ...(result
      ? {
          result: {
            status: result.status,
            ok: result.ok,
            completed_at: result.completedAt,
            duration_ms: result.durationMs,
            output: result.output,
            ...(result.status === 'canceled' && resultCancel
              ? { cancel: resultCancel }
              : {}),
            ...(result.archivePath ? { archive_path: result.archivePath } : {}),
            usage: normalizeYamlUsage(result.usage),
          },
        }
      : {}),
  }
}

export const formatTasksYaml = (
  tasks: Task[],
  results: TaskResult[],
): string => {
  if (tasks.length === 0 && results.length === 0) return ''
  const resultById = new Map(results.map((result) => [result.taskId, result]))
  const ordered = selectTasksForPrompt(tasks)
  const taskEntries: Array<Record<string, unknown>> = []
  if (ordered.length === 0 && results.length > 0) {
    for (const result of results) {
      const fallbackTask: Task = {
        id: result.taskId,
        fingerprint: '',
        prompt: '',
        title: result.title ?? result.taskId,
        profile: result.profile === 'specialist' ? 'specialist' : 'standard',
        status: result.status,
        createdAt: result.completedAt,
        completedAt: result.completedAt,
      }
      taskEntries.push(formatTaskEntry(fallbackTask, result))
    }
    return escapeCdata(stringifyPromptYaml({ tasks: taskEntries }))
  }
  for (const task of ordered)
    taskEntries.push(formatTaskEntry(task, resultById.get(task.id)))

  return escapeCdata(stringifyPromptYaml({ tasks: taskEntries }))
}

export const formatResultsYaml = (
  tasks: Task[],
  results: TaskResult[],
): string => {
  if (results.length === 0) return ''
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const resultById = new Map<string, TaskResult>()
  for (const result of results) {
    const existing = resultById.get(result.taskId)
    if (!existing) {
      resultById.set(result.taskId, result)
      continue
    }
    const existingTs = parseIsoToMs(existing.completedAt)
    const nextTs = parseIsoToMs(result.completedAt)
    if (nextTs >= existingTs) resultById.set(result.taskId, result)
  }
  const ordered = Array.from(resultById.values()).sort((a, b) => {
    const aTs = parseIsoToMs(a.completedAt)
    const bTs = parseIsoToMs(b.completedAt)
    if (aTs !== bTs) return bTs - aTs
    return a.taskId.localeCompare(b.taskId)
  })
  const taskEntries: Array<Record<string, unknown>> = []
  for (const result of ordered) {
    const task = taskById.get(result.taskId)
    const title = task?.title.trim() ?? result.title?.trim() ?? result.taskId
    const cancel = formatCancelMeta(result.cancel ?? task?.cancel)
    taskEntries.push({
      id: result.taskId,
      title,
      prompt: task?.prompt ?? '',
      changed_at: result.completedAt,
      result: {
        status: result.status,
        ok: result.ok,
        completed_at: result.completedAt,
        duration_ms: result.durationMs,
        output: result.output,
        ...(result.status === 'canceled' && cancel ? { cancel } : {}),
        ...(result.archivePath ? { archive_path: result.archivePath } : {}),
        usage: normalizeYamlUsage(result.usage),
      },
    })
  }
  return escapeCdata(
    stringifyPromptYaml({
      tasks: taskEntries,
    }),
  )
}
