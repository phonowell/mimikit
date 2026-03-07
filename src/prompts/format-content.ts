import { GLOBAL_FOCUS_ID } from '../focus/index.js'
import { toDisplayPath } from '../shared/path-display.js'
import {
  buildPlanProgressPayload,
  buildPlanTriggerPayload,
} from '../shared/plan-payload.js'
import { truncateText } from '../shared/text.js'

import {
  escapeCdata,
  normalizePromptUsage,
  parseIsoToMs,
  resolveTaskChangedAt,
  sortTasksByChangedAt,
  stringifyPromptJson,
} from './format-base.js'

import type {
  Task,
  TaskCancelMeta,
  TaskPlan,
  TaskResult,
} from '../types/index.js'

const TASK_PROMPT_MAX_CHARS = 240
const TASK_OUTPUT_MAX_CHARS = 320
const TASK_HANDOFF_TEXT_MAX_CHARS = 220
const PLAN_PROMPT_MAX_CHARS = 220

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

const toHandoffPayload = (
  handoff: TaskResult['handoff'],
): Record<string, unknown> | undefined => {
  if (!handoff) return undefined
  const text = (value?: string): string | undefined => {
    if (!value) return undefined
    return truncateText(value, TASK_HANDOFF_TEXT_MAX_CHARS, {
      normalizeWhitespace: true,
    })
  }
  const list = (items?: string[]): string[] | undefined => {
    if (!items || items.length === 0) return undefined
    const normalized = items
      .map((item) => text(item))
      .filter((item): item is string => Boolean(item))
    return normalized.length > 0 ? normalized : undefined
  }
  const artifacts = handoff.artifacts
    ?.map((item) => {
      const path = item.path.trim()
      if (!path) return null
      return {
        path,
        ...(item.kind?.trim() ? { kind: item.kind.trim() } : {}),
        ...(text(item.note) ? { note: text(item.note) } : {}),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  const evidence = handoff.evidence
    ?.map((item) => {
      const ref = item.ref.trim()
      if (!ref) return null
      return {
        type: item.type,
        ref,
        ...(text(item.note) ? { note: text(item.note) } : {}),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  const goal = text(handoff.goal)
  const summary = text(handoff.summary)
  const decisions = list(handoff.decisions)
  const nextSteps = list(handoff.nextSteps)
  const risks = list(handoff.risks)
  const payload = {
    ...(goal ? { goal } : {}),
    ...(summary ? { summary } : {}),
    ...(decisions ? { decisions } : {}),
    ...(nextSteps ? { next_steps: nextSteps } : {}),
    ...(risks ? { risks } : {}),
    ...(artifacts && artifacts.length > 0 ? { artifacts } : {}),
    ...(evidence && evidence.length > 0 ? { evidence } : {}),
  }
  return Object.keys(payload).length > 0 ? payload : undefined
}

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
  const handoff = toHandoffPayload(result.handoff)
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
    ...(handoff ? { handoff } : {}),
    usage: normalizePromptUsage(result.usage),
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
    provider: task.provider,
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
  provider: result.provider ?? 'codex',
  status: result.status,
  focusId: GLOBAL_FOCUS_ID,
  createdAt: result.completedAt,
  completedAt: result.completedAt,
})

export const formatTasksJson = (
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
    : escapeCdata(stringifyPromptJson({ tasks: entries }))
}

export const formatResultsJson = (
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
        provider: task?.provider ?? result.provider ?? 'codex',
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

  return escapeCdata(stringifyPromptJson({ tasks: entries }))
}

const formatPlanEntry = (plan: TaskPlan): Record<string, unknown> => ({
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
  ...buildPlanProgressPayload(plan),
  ...buildPlanTriggerPayload(plan.trigger),
  ...(plan.doneReason ? { done_reason: plan.doneReason } : {}),
})

export const formatPlansJson = (plans: TaskPlan[]): string => {
  if (plans.length === 0) return ''
  return escapeCdata(
    stringifyPromptJson({
      plans: plans.map(formatPlanEntry),
    }),
  )
}
