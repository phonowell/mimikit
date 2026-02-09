import { z } from 'zod'

import { appendReportingEvent } from '../../../reporting/events.js'
import { enqueueTask } from '../../../tasks/queue.js'
import { persistRuntimeState } from '../../core/runtime-persistence.js'
import { notifyWorkerLoop } from '../../core/worker-signal.js'
import { appendTaskSystemMessage } from '../../read-model/task-history.js'
import { cancelTask } from '../worker/worker-cancel-task.js'
import { enqueueWorkerTask } from '../worker/worker-dispatch.js'

import type { Parsed } from '../../../actions/model/spec.js'
import type { WorkerProfile } from '../../../types/index.js'
import type { RuntimeState } from '../../core/runtime-state.js'

const nonEmptyString = z.string().trim().min(1)

const summarizeSchema = z
  .object({
    task_id: nonEmptyString,
    summary: nonEmptyString,
  })
  .strict()

const createSchema = z
  .object({
    prompt: nonEmptyString,
    title: nonEmptyString,
    profile: z.enum(['standard', 'expert']),
  })
  .strict()

const cancelSchema = z
  .object({
    task_id: nonEmptyString,
  })
  .strict()

const feedbackSchema = z
  .object({
    message: nonEmptyString,
  })
  .strict()

const parseFeedbackMessage = (item: Parsed): string | undefined => {
  const parsed = feedbackSchema.safeParse(item.attrs)
  if (!parsed.success) return undefined
  return parsed.data.message
}

export const collectFeedbackMessages = (items: Parsed[]): string[] =>
  items
    .map((item) => parseFeedbackMessage(item))
    .filter((value): value is string => value !== undefined)

const parseSummary = (
  item: Parsed,
): { taskId: string; summary: string } | undefined => {
  const parsed = summarizeSchema.safeParse(item.attrs)
  if (!parsed.success) return undefined
  return { taskId: parsed.data.task_id, summary: parsed.data.summary }
}

export const collectTaskResultSummaries = (
  items: Parsed[],
): Map<string, string> => {
  const summaries = new Map<string, string>()
  for (const item of items) {
    if (item.name !== 'summarize_task_result') continue
    const summary = parseSummary(item)
    if (!summary) continue
    summaries.set(summary.taskId, summary.summary)
  }
  return summaries
}

const applyCreateTask = async (
  runtime: RuntimeState,
  item: Parsed,
  seen: Set<string>,
): Promise<void> => {
  const parsed = createSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const profile = parsed.data.profile as WorkerProfile
  const dedupeKey = `${parsed.data.prompt}\n${parsed.data.title}\n${profile}`
  if (seen.has(dedupeKey)) return
  seen.add(dedupeKey)
  const { task, created } = enqueueTask(
    runtime.tasks,
    parsed.data.prompt,
    parsed.data.title,
    profile,
  )
  if (!created) return
  await appendTaskSystemMessage(runtime.paths.history, 'created', task, {
    createdAt: task.createdAt,
  })
  await persistRuntimeState(runtime)
  enqueueWorkerTask(runtime, task)
  notifyWorkerLoop(runtime)
}

const applyFeedback = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const message = parseFeedbackMessage(item)
  if (!message) return
  await appendReportingEvent({
    stateDir: runtime.config.stateDir,
    source: 'thinker_action',
    category: 'other',
    severity: 'medium',
    message,
    note: 'thinker_capture_feedback',
  })
}

export const applyTaskActions = async (
  runtime: RuntimeState,
  items: Parsed[],
): Promise<void> => {
  const seen = new Set<string>()
  for (const item of items) {
    if (item.name === 'create_task') {
      await applyCreateTask(runtime, item, seen)
      continue
    }
    if (item.name === 'cancel_task') {
      const parsed = cancelSchema.safeParse(item.attrs)
      if (!parsed.success) continue
      await cancelTask(runtime, parsed.data.task_id, { source: 'thinker' })
      continue
    }
    if (item.name === 'capture_feedback') {
      await applyFeedback(runtime, item)
      continue
    }
  }
}
