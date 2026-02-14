import {
  escapeCdata,
  normalizeYamlUsage,
  parseIsoToMs,
  resolveTaskChangedAt,
  stringifyPromptYaml,
} from './format-base.js'

import type {
  CronJob,
  Task,
  TaskCancelMeta,
  TaskResult,
} from '../types/index.js'

const TASK_PROMPT_MAX_CHARS = 240
const TASK_OUTPUT_MAX_CHARS = 320

const truncateForPrompt = (value: string, maxChars: number): string => {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxChars) return normalized
  const suffix = '...'
  const keep = Math.max(0, maxChars - suffix.length)
  return `${normalized.slice(0, keep).trimEnd()}${suffix}`
}

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
    prompt: truncateForPrompt(task.prompt, TASK_PROMPT_MAX_CHARS),
    ...(task.status === 'canceled' && taskCancel ? { cancel: taskCancel } : {}),
    ...(result
      ? {
          result: {
            status: result.status,
            ok: result.ok,
            completed_at: result.completedAt,
            duration_ms: result.durationMs,
            output: truncateForPrompt(result.output, TASK_OUTPUT_MAX_CHARS),
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
  cronJobs: CronJob[] = [],
): string => {
  if (tasks.length === 0 && results.length === 0 && cronJobs.length === 0)
    return ''
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
  } else {
    for (const task of ordered)
      taskEntries.push(formatTaskEntry(task, resultById.get(task.id)))
  }

  for (const job of cronJobs) {
    if (!job.enabled) continue
    taskEntries.push({
      id: job.id,
      type: job.cron ? 'cron' : 'scheduled',
      title: job.title,
      ...(job.cron ? { cron: job.cron } : {}),
      ...(job.scheduledAt ? { scheduled_at: job.scheduledAt } : {}),
      created_at: job.createdAt,
      ...(job.lastTriggeredAt
        ? { last_triggered_at: job.lastTriggeredAt }
        : {}),
    })
  }

  if (taskEntries.length === 0) return ''

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
      prompt: truncateForPrompt(task?.prompt ?? '', TASK_PROMPT_MAX_CHARS),
      changed_at: result.completedAt,
      result: {
        status: result.status,
        ok: result.ok,
        completed_at: result.completedAt,
        duration_ms: result.durationMs,
        output: truncateForPrompt(result.output, TASK_OUTPUT_MAX_CHARS),
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
