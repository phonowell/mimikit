import { isAbsolute, relative, resolve } from 'node:path'

import { GLOBAL_FOCUS_ID } from '../focus/index.js'
import { truncateText } from '../shared/text.js'

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
  TaskPlan,
} from '../types/index.js'

const TASK_PROMPT_MAX_CHARS = 240
const TASK_OUTPUT_MAX_CHARS = 320
const PLAN_PROMPT_MAX_CHARS = 220

export const selectTasksForPrompt = (tasks: Task[]): Task[] =>
  sortTasksByChangedAt(tasks)

const toDisplayPath = (path: string, workDir?: string): string => {
  const trimmedPath = path.trim()
  if (!workDir) return trimmedPath
  const trimmedWorkDir = workDir.trim()
  if (!trimmedWorkDir) return trimmedPath
  const resolvedWorkDir = resolve(trimmedWorkDir)
  const resolvedPath = isAbsolute(trimmedPath)
    ? resolve(trimmedPath)
    : resolve(resolvedWorkDir, trimmedPath)
  const rel = relative(resolvedWorkDir, resolvedPath)
  if (!rel) return '.'
  if (rel.startsWith('..') || isAbsolute(rel)) return trimmedPath
  return rel
}

const toCancelMeta = (
  cancel?: TaskCancelMeta,
): Record<string, unknown> | undefined =>
  cancel
    ? {
        source: cancel.source,
        ...(cancel.reason ? { reason: cancel.reason } : {}),
      }
    : undefined

const pickArchivePath = (
  resultArchivePath?: string,
  taskArchivePath?: string,
  workDir?: string,
): string | undefined => {
  const resultPath = resultArchivePath?.trim()
  if (resultPath) return toDisplayPath(resultPath, workDir)
  const taskPath = taskArchivePath?.trim()
  if (taskPath) return toDisplayPath(taskPath, workDir)
  return undefined
}

const toResultPayload = (
  result: TaskResult,
  cancel?: TaskCancelMeta,
  taskArchivePath?: string,
  workDir?: string,
): Record<string, unknown> => {
  const archivePath = pickArchivePath(
    result.archivePath,
    taskArchivePath,
    workDir,
  )
  return {
    status: result.status,
    ok: result.ok,
    completed_at: result.completedAt,
    duration_ms: result.durationMs,
    output: truncateText(result.output, TASK_OUTPUT_MAX_CHARS, {
      normalizeWhitespace: true,
    }),
    ...(result.status === 'canceled' && cancel
      ? { cancel: toCancelMeta(cancel) }
      : {}),
    ...(archivePath ? { archive_path: archivePath } : {}),
    usage: normalizeYamlUsage(result.usage),
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
    title: task.title.trim() || task.id,
    changed_at: resolveTaskChangedAt(task),
    prompt: truncateText(task.prompt, TASK_PROMPT_MAX_CHARS, {
      normalizeWhitespace: true,
    }),
    ...(task.cron ? { cron: task.cron } : {}),
    ...(task.scheduledAt ? { scheduled_at: task.scheduledAt } : {}),
    ...(task.status === 'canceled' && task.cancel
      ? { cancel: toCancelMeta(task.cancel) }
      : {}),
    ...(result
      ? {
          result: toResultPayload(
            result,
            result.cancel ?? task.cancel,
            task.archivePath,
            workDir,
          ),
        }
      : {}),
  }
}

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
  workDir?: string,
): string => {
  if (tasks.length === 0 && results.length === 0) return ''

  const resultById = new Map(results.map((result) => [result.taskId, result]))
  const orderedTasks = selectTasksForPrompt(tasks)
  const entries =
    orderedTasks.length === 0 && results.length > 0
      ? results.map((result) =>
          formatTaskEntry(buildFallbackTask(result), result, workDir),
        )
      : orderedTasks.map((task) =>
          formatTaskEntry(task, resultById.get(task.id), workDir),
        )

  return entries.length === 0
    ? ''
    : escapeCdata(stringifyPromptYaml({ tasks: entries }))
}

export const formatResultsYaml = (
  tasks: Task[],
  results: TaskResult[],
  workDir?: string,
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
      const archivePath = pickArchivePath(
        result.archivePath,
        task?.archivePath,
        workDir,
      )
      return {
        id: result.taskId,
        title: task?.title.trim() ?? result.title?.trim() ?? result.taskId,
        prompt: truncateText(task?.prompt ?? '', TASK_PROMPT_MAX_CHARS, {
          normalizeWhitespace: true,
        }),
        changed_at: result.completedAt,
        ...(archivePath ? { archive_path: archivePath } : {}),
        result: toResultPayload(
          result,
          result.cancel ?? task?.cancel,
          task?.archivePath,
          workDir,
        ),
      }
    })

  return escapeCdata(stringifyPromptYaml({ tasks: entries }))
}

const formatPlanEntry = (
  plan: TaskPlan,
): Record<string, unknown> => ({
  id: plan.id,
  status: plan.status,
  priority: plan.priority,
  source: plan.source,
  title: plan.title.trim() || plan.id,
  prompt: truncateText(plan.prompt, PLAN_PROMPT_MAX_CHARS, {
    normalizeWhitespace: true,
  }),
  created_at: plan.createdAt,
  updated_at: plan.updatedAt,
  run_count: plan.runCount,
  ...(plan.maxRuns !== undefined ? { max_runs: plan.maxRuns } : {}),
  trigger_mode: plan.trigger.mode,
  ...(plan.trigger.mode === 'cron' ? { cron: plan.trigger.cron } : {}),
  ...(plan.trigger.mode === 'scheduled_at'
    ? { scheduled_at: plan.trigger.scheduledAt }
    : {}),
  ...(plan.trigger.mode === 'on_idle'
    ? { cooldown_ms: plan.trigger.cooldownMs }
    : {}),
  ...(plan.lastTriggeredAt
    ? { last_triggered_at: plan.lastTriggeredAt }
    : {}),
  ...(plan.lastCompletedAt
    ? { last_completed_at: plan.lastCompletedAt }
    : {}),
  ...(plan.lastTaskId ? { last_task_id: plan.lastTaskId } : {}),
  ...(plan.archivedAt ? { archived_at: plan.archivedAt } : {}),
  ...(plan.doneReason ? { done_reason: plan.doneReason } : {}),
})

export const formatPlansYaml = (plans: TaskPlan[]): string => {
  if (plans.length === 0) return ''
  return escapeCdata(
    stringifyPromptYaml({
      plans: plans.map(formatPlanEntry),
    }),
  )
}
