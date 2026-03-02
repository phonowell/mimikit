import { GLOBAL_FOCUS_ID } from '../focus/index.js'

import {
  escapeCdata,
  normalizeYamlUsage,
  parseIsoToMs,
  resolveTaskChangedAt,
  sortTasksByChangedAt,
  stringifyPromptYaml,
} from './format-base.js'

import type {
  Task,
  TaskCancelMeta,
  TaskResult,
  TaskTemplate,
} from '../types/index.js'

const TASK_PROMPT_MAX_CHARS = 240
const TASK_OUTPUT_MAX_CHARS = 320
const TEMPLATE_PROMPT_MAX_CHARS = 220

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
  ...(task.cron ? { cron: task.cron } : {}),
  ...(task.scheduledAt ? { scheduled_at: task.scheduledAt } : {}),
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
  focusId: GLOBAL_FOCUS_ID,
  createdAt: result.completedAt,
  completedAt: result.completedAt,
})

export const formatTasksYaml = (
  tasks: Task[],
  results: TaskResult[],
): string => {
  if (tasks.length === 0 && results.length === 0) return ''

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

const formatTemplateEntry = (
  template: TaskTemplate,
): Record<string, unknown> => ({
  id: template.id,
  status: template.status,
  priority: template.priority,
  source: template.source,
  title: template.title.trim() || template.id,
  prompt: truncateForPrompt(template.prompt, TEMPLATE_PROMPT_MAX_CHARS),
  created_at: template.createdAt,
  updated_at: template.updatedAt,
  run_count: template.runCount,
  ...(template.maxRuns !== undefined ? { max_runs: template.maxRuns } : {}),
  trigger_mode: template.trigger.mode,
  ...(template.trigger.mode === 'cron' ? { cron: template.trigger.cron } : {}),
  ...(template.trigger.mode === 'scheduled_at'
    ? { scheduled_at: template.trigger.scheduledAt }
    : {}),
  ...(template.trigger.mode === 'on_idle'
    ? { cooldown_ms: template.trigger.cooldownMs }
    : {}),
  ...(template.lastTriggeredAt
    ? { last_triggered_at: template.lastTriggeredAt }
    : {}),
  ...(template.lastCompletedAt
    ? { last_completed_at: template.lastCompletedAt }
    : {}),
  ...(template.lastTaskId ? { last_task_id: template.lastTaskId } : {}),
  ...(template.archivedAt ? { archived_at: template.archivedAt } : {}),
  ...(template.doneReason ? { done_reason: template.doneReason } : {}),
})

export const formatTemplatesYaml = (templates: TaskTemplate[]): string => {
  if (templates.length === 0) return ''
  return escapeCdata(
    stringifyPromptYaml({
      templates: templates.map(formatTemplateEntry),
    }),
  )
}
