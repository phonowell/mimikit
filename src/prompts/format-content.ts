import {
  escapeCdata,
  normalizeYamlUsage,
  parseIsoToMs,
  resolveTaskChangedAt,
  sortTasksByChangedAt,
  stringifyPromptYaml,
} from './format-base.js'

import type {
  CronJob,
  IdleIntent,
  Task,
  TaskCancelMeta,
  TaskResult,
} from '../types/index.js'

const TASK_PROMPT_MAX_CHARS = 240
const TASK_OUTPUT_MAX_CHARS = 320
const INTENT_PROMPT_MAX_CHARS = 220

const truncateForPrompt = (value: string, maxChars: number): string => {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`
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

const toResultPayload = (
  result: TaskResult,
  cancel?: TaskCancelMeta,
): Record<string, unknown> => ({
  status: result.status,
  ok: result.ok,
  completed_at: result.completedAt,
  duration_ms: result.durationMs,
  output: truncateForPrompt(result.output, TASK_OUTPUT_MAX_CHARS),
  ...(result.status === 'canceled' && cancel
    ? { cancel: toCancelMeta(cancel) }
    : {}),
  ...(result.archivePath ? { archive_path: result.archivePath } : {}),
  usage: normalizeYamlUsage(result.usage),
})

const formatTaskEntry = (
  task: Task,
  result: TaskResult | undefined,
): Record<string, unknown> => ({
  id: task.id,
  status: task.status,
  title: task.title.trim() || task.id,
  changed_at: resolveTaskChangedAt(task),
  prompt: truncateForPrompt(task.prompt, TASK_PROMPT_MAX_CHARS),
  ...(task.status === 'canceled' && task.cancel
    ? { cancel: toCancelMeta(task.cancel) }
    : {}),
  ...(result
    ? { result: toResultPayload(result, result.cancel ?? task.cancel) }
    : {}),
})

const buildFallbackTask = (result: TaskResult): Task => ({
  id: result.taskId,
  fingerprint: '',
  prompt: '',
  title: result.title ?? result.taskId,
  profile: 'worker',
  status: result.status,
  createdAt: result.completedAt,
  completedAt: result.completedAt,
})

export const formatTasksYaml = (
  tasks: Task[],
  results: TaskResult[],
  cronJobs: CronJob[] = [],
): string => {
  if (tasks.length === 0 && results.length === 0 && cronJobs.length === 0)
    return ''

  const resultById = new Map(results.map((result) => [result.taskId, result]))
  const orderedTasks = selectTasksForPrompt(tasks)
  const entries =
    orderedTasks.length === 0 && results.length > 0
      ? results.map((result) =>
          formatTaskEntry(buildFallbackTask(result), result),
        )
      : orderedTasks.map((task) =>
          formatTaskEntry(task, resultById.get(task.id)),
        )

  for (const job of cronJobs) {
    if (!job.enabled) continue
    entries.push({
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

  return entries.length === 0
    ? ''
    : escapeCdata(stringifyPromptYaml({ tasks: entries }))
}

export const formatResultsYaml = (
  tasks: Task[],
  results: TaskResult[],
): string => {
  if (results.length === 0) return ''

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
      return {
        id: result.taskId,
        title: task?.title.trim() ?? result.title?.trim() ?? result.taskId,
        prompt: truncateForPrompt(task?.prompt ?? '', TASK_PROMPT_MAX_CHARS),
        changed_at: result.completedAt,
        result: toResultPayload(result, result.cancel ?? task?.cancel),
      }
    })

  return escapeCdata(stringifyPromptYaml({ tasks: entries }))
}

const formatIntentEntry = (intent: IdleIntent): Record<string, unknown> => ({
  id: intent.id,
  status: intent.status,
  priority: intent.priority,
  source: intent.source,
  title: intent.title.trim() || intent.id,
  prompt: truncateForPrompt(intent.prompt, INTENT_PROMPT_MAX_CHARS),
  created_at: intent.createdAt,
  updated_at: intent.updatedAt,
  attempts: intent.attempts,
  max_attempts: intent.maxAttempts,
  ...(intent.lastTaskId ? { last_task_id: intent.lastTaskId } : {}),
  ...(intent.archivedAt ? { archived_at: intent.archivedAt } : {}),
})

export const formatIntentsYaml = (intents: IdleIntent[]): string => {
  if (intents.length === 0) return ''
  return escapeCdata(
    stringifyPromptYaml({
      intents: intents.map(formatIntentEntry),
    }),
  )
}
