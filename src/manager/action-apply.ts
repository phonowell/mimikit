import { z } from 'zod'

import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import {
  buildTaskFingerprint,
  enqueueTask,
} from '../orchestrator/core/task-state.js'
import { notifyWorkerLoop } from '../orchestrator/core/worker-signal.js'
import { appendTaskSystemMessage } from '../orchestrator/read-model/task-history.js'
import { newId, nowIso } from '../shared/utils.js'
import { cancelTask } from '../worker/cancel-task.js'
import { enqueueWorkerTask } from '../worker/dispatch.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { CronJob, Task, WorkerProfile } from '../types/index.js'

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
    profile: z.enum(['standard', 'specialist']),
    cron: z.string().trim().optional(),
    scheduled_at: z.string().trim().optional(),
  })
  .strict()
  .refine(
    (data) => !(data.cron?.trim() && data.scheduled_at?.trim()),
    'cron and scheduled_at are mutually exclusive',
  )

const cancelSchema = z
  .object({
    id: nonEmptyString,
  })
  .strict()

const restartSchema = z.object({}).strict()

const parseSummary = (
  item: Parsed,
): { taskId: string; summary: string } | undefined => {
  const parsed = summarizeSchema.safeParse(item.attrs)
  if (!parsed.success) return undefined
  return { taskId: parsed.data.task_id, summary: parsed.data.summary }
}

const requestManagerRestart = (runtime: RuntimeState): void => {
  setTimeout(() => {
    void (async () => {
      runtime.stopped = true
      notifyWorkerLoop(runtime)
      await bestEffort('persistRuntimeState: manager_restart', () =>
        persistRuntimeState(runtime),
      )
      process.exit(75)
    })()
  }, 100)
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

type ApplyTaskActionsOptions = {
  suppressCreateTask?: boolean
}

const applyCreateTask = async (
  runtime: RuntimeState,
  item: Parsed,
  seen: Set<string>,
  options?: ApplyTaskActionsOptions,
): Promise<void> => {
  if (options?.suppressCreateTask) return
  const parsed = createSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const profile = parsed.data.profile as WorkerProfile
  const cron = parsed.data.cron?.trim()
  const scheduledAt = parsed.data.scheduled_at?.trim()
  const scheduleKey = cron ?? scheduledAt ?? ''
  const dedupeKey = `${parsed.data.prompt}\n${parsed.data.title}\n${profile}\n${scheduleKey}`
  if (seen.has(dedupeKey)) return
  seen.add(dedupeKey)

  if (cron || scheduledAt) {
    if (scheduledAt && !Number.isFinite(Date.parse(scheduledAt))) return

    const existing = runtime.cronJobs.find((job) => {
      if (!job.enabled) return false
      if (cron) {
        return (
          job.cron === cron &&
          job.prompt === parsed.data.prompt &&
          job.title === parsed.data.title &&
          job.profile === profile
        )
      }
      return (
        job.scheduledAt === scheduledAt &&
        job.prompt === parsed.data.prompt &&
        job.title === parsed.data.title &&
        job.profile === profile
      )
    })
    if (existing) return

    const cronJob: CronJob = {
      id: newId(),
      ...(cron ? { cron } : {}),
      ...(scheduledAt ? { scheduledAt } : {}),
      prompt: parsed.data.prompt,
      title: parsed.data.title,
      profile,
      enabled: true,
      createdAt: nowIso(),
    }
    runtime.cronJobs.push(cronJob)
    const scheduledTask: Task = {
      id: cronJob.id,
      fingerprint: buildTaskFingerprint(parsed.data.prompt),
      prompt: parsed.data.prompt,
      title: parsed.data.title,
      ...(cron ? { cron } : scheduledAt ? { cron: scheduledAt } : {}),
      profile,
      status: 'pending',
      createdAt: cronJob.createdAt,
    }
    await appendTaskSystemMessage(
      runtime.paths.history,
      'created',
      scheduledTask,
      {
        createdAt: cronJob.createdAt,
      },
    )
    await persistRuntimeState(runtime)
    return
  }

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

export const applyTaskActions = async (
  runtime: RuntimeState,
  items: Parsed[],
  options?: ApplyTaskActionsOptions,
): Promise<void> => {
  const seen = new Set<string>()
  for (const item of items) {
    if (item.name === 'create_task') {
      await applyCreateTask(runtime, item, seen, options)
      continue
    }
    if (item.name === 'cancel_task') {
      const parsed = cancelSchema.safeParse(item.attrs)
      if (!parsed.success) continue
      const { id } = parsed.data
      const canceled = await cancelTask(runtime, id, { source: 'manager' })
      if (canceled.ok || canceled.status !== 'not_found') continue
      const cronJob = runtime.cronJobs.find((job) => job.id === id)
      if (!cronJob?.enabled) continue
      cronJob.enabled = false
      await persistRuntimeState(runtime)
      continue
    }
    if (item.name === 'restart_server') {
      const parsed = restartSchema.safeParse(item.attrs)
      if (!parsed.success) continue
      requestManagerRestart(runtime)
      return
    }
  }
}
