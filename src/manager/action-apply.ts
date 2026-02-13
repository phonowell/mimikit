import { z } from 'zod'

import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { enqueueTask } from '../orchestrator/core/task-state.js'
import { notifyWorkerLoop } from '../orchestrator/core/worker-signal.js'
import { appendTaskSystemMessage } from '../orchestrator/read-model/task-history.js'
import { newId, nowIso } from '../shared/utils.js'
import { cancelTask } from '../worker/cancel-task.js'
import { enqueueWorkerTask } from '../worker/dispatch.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { CronJob, TaskNextDef, WorkerProfile } from '../types/index.js'

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
    next: z.string().trim().optional(),
  })
  .strict()

const cancelSchema = z
  .object({
    task_id: nonEmptyString,
  })
  .strict()

const restartSchema = z.object({}).strict()

const createCronSchema = z
  .object({
    cron: nonEmptyString,
    prompt: nonEmptyString,
    title: nonEmptyString,
    profile: z.enum(['standard', 'specialist']),
    next: z.string().trim().optional(),
  })
  .strict()

const cancelCronSchema = z
  .object({
    cron_job_id: nonEmptyString,
  })
  .strict()

const taskNextSchema = z
  .object({
    prompt: nonEmptyString,
    title: z.string().trim().optional(),
    profile: z.enum(['standard', 'specialist']).optional(),
    condition: z.enum(['succeeded', 'failed', 'any']).optional(),
  })
  .strict()

const taskNextListSchema = z.union([taskNextSchema, z.array(taskNextSchema)])

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

const normalizeTaskNext = (
  value: z.infer<typeof taskNextSchema>,
): TaskNextDef => {
  const next: TaskNextDef = {
    prompt: value.prompt,
    condition: value.condition ?? 'succeeded',
  }
  if (value.title && value.title.length > 0) next.title = value.title
  if (value.profile) next.profile = value.profile
  return next
}

const parseTaskNext = (raw?: string): TaskNextDef[] | undefined => {
  if (!raw) return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  try {
    const parsedRaw = JSON.parse(trimmed) as unknown
    const parsed = taskNextListSchema.safeParse(parsedRaw)
    if (!parsed.success) return undefined
    const list = Array.isArray(parsed.data) ? parsed.data : [parsed.data]
    if (list.length === 0) return undefined
    return list.map((item) => normalizeTaskNext(item))
  } catch {
    return undefined
  }
}

const serializeTaskNext = (next?: TaskNextDef[]): string =>
  JSON.stringify(next ?? [])

const serializeCronNext = (next?: TaskNextDef): string =>
  JSON.stringify(next ?? null)

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
  const next = parseTaskNext(parsed.data.next)
  const dedupeKey = `${parsed.data.prompt}\n${parsed.data.title}\n${profile}\n${serializeTaskNext(next)}`
  if (seen.has(dedupeKey)) return
  seen.add(dedupeKey)
  const { task, created } = enqueueTask(
    runtime.tasks,
    parsed.data.prompt,
    parsed.data.title,
    profile,
    next,
  )
  if (!created) return
  await appendTaskSystemMessage(runtime.paths.history, 'created', task, {
    createdAt: task.createdAt,
  })
  await persistRuntimeState(runtime)
  enqueueWorkerTask(runtime, task)
  notifyWorkerLoop(runtime)
}

const applyCreateCronJob = async (
  runtime: RuntimeState,
  item: Parsed,
  seen: Set<string>,
): Promise<void> => {
  const parsed = createCronSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const profile = parsed.data.profile as WorkerProfile
  const nextList = parseTaskNext(parsed.data.next)
  const cronNext = nextList?.[0]
  const dedupeKey = [
    'create_cron_job',
    parsed.data.cron,
    parsed.data.prompt,
    parsed.data.title,
    profile,
    serializeCronNext(cronNext),
  ].join('\n')
  if (seen.has(dedupeKey)) return
  seen.add(dedupeKey)

  const existing = runtime.cronJobs.find(
    (job) =>
      job.enabled &&
      job.cron === parsed.data.cron &&
      job.prompt === parsed.data.prompt &&
      job.title === parsed.data.title &&
      job.profile === profile &&
      serializeCronNext(job.next) === serializeCronNext(cronNext),
  )
  if (existing) return

  const cronJob: CronJob = {
    id: newId(),
    cron: parsed.data.cron,
    prompt: parsed.data.prompt,
    title: parsed.data.title,
    profile,
    enabled: true,
    createdAt: nowIso(),
    ...(cronNext ? { next: cronNext } : {}),
  }
  runtime.cronJobs.push(cronJob)
  await persistRuntimeState(runtime)
}

const applyCancelCronJob = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = cancelCronSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const cronJob = runtime.cronJobs.find(
    (entry) => entry.id === parsed.data.cron_job_id,
  )
  if (!cronJob || !cronJob.enabled) return
  cronJob.enabled = false
  await persistRuntimeState(runtime)
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
      await cancelTask(runtime, parsed.data.task_id, { source: 'manager' })
      continue
    }
    if (item.name === 'create_cron_job') {
      await applyCreateCronJob(runtime, item, seen)
      continue
    }
    if (item.name === 'cancel_cron_job') {
      await applyCancelCronJob(runtime, item)
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
