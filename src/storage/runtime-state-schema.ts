import { z } from 'zod'

import { stripUndefined } from '../shared/utils.js'
import { normalizeTokenUsage, tokenUsageSchema } from './token-usage.js'

import type { CronJob, Task } from '../types/index.js'

export type RuntimeSnapshot = {
  tasks: Task[]
  cronJobs?: CronJob[]
  queues?: {
    inputsCursor: number
    resultsCursor: number
  }
}

const taskCancelSchema = z
  .object({
    source: z.enum(['user', 'manager', 'system']),
    reason: z.string().optional(),
  })
  .strict()

const taskResultRawSchema = z
  .object({
    taskId: z.string().trim().min(1),
    status: z.enum(['succeeded', 'failed', 'canceled']),
    ok: z.boolean(),
    output: z.string(),
    durationMs: z.number().finite().nonnegative(),
    completedAt: z.string(),
    usage: tokenUsageSchema.optional(),
    title: z.string().optional(),
    archivePath: z.string().optional(),
    profile: z.enum(['standard', 'specialist', 'manager']).optional(),
    cancel: taskCancelSchema.optional(),
  })
  .strict()

const taskRawSchema = z
  .object({
    id: z.string().trim().min(1),
    fingerprint: z.string().trim().min(1),
    prompt: z.string(),
    title: z.string(),
    cron: z.string().optional(),
    profile: z.enum(['standard', 'specialist', 'manager']),
    status: z.enum(['pending', 'running', 'succeeded', 'failed', 'canceled']),
    createdAt: z.string(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    durationMs: z.number().finite().nonnegative().optional(),
    attempts: z.number().int().nonnegative().optional(),
    usage: tokenUsageSchema.optional(),
    archivePath: z.string().optional(),
    cancel: taskCancelSchema.optional(),
    result: taskResultRawSchema.optional(),
  })
  .strict()

const cronJobRawSchema = z
  .object({
    id: z.string().trim().min(1),
    cron: z.string().trim().min(1).optional(),
    scheduledAt: z.string().trim().min(1).optional(),
    prompt: z.string(),
    title: z.string(),
    profile: z.enum(['standard', 'specialist', 'manager']),
    enabled: z.boolean(),
    createdAt: z.string(),
    lastTriggeredAt: z.string().optional(),
  })
  .strict()
  .refine((data) => data.cron !== undefined || data.scheduledAt !== undefined, {
    message: 'cron or scheduledAt required',
  })
  .refine(
    (data) => !(data.cron !== undefined && data.scheduledAt !== undefined),
    {
      message: 'cron and scheduledAt are mutually exclusive',
    },
  )

const queueStateSchema = z
  .object({
    inputsCursor: z.number().int().nonnegative(),
    resultsCursor: z.number().int().nonnegative(),
  })
  .strict()

const runtimeSnapshotRawSchema = z
  .object({
    tasks: z.array(taskRawSchema),
    cronJobs: z.array(cronJobRawSchema).optional(),
    queues: queueStateSchema.optional(),
  })
  .strict()

const toCancel = (raw?: z.infer<typeof taskCancelSchema>) =>
  raw ? stripUndefined({ source: raw.source, reason: raw.reason }) : undefined

const toTask = (task: z.infer<typeof taskRawSchema>): Task => {
  const usage = normalizeTokenUsage(task.usage)
  const cancel = toCancel(task.cancel)
  const result = task.result
    ? stripUndefined({
        taskId: task.result.taskId,
        status: task.result.status,
        ok: task.result.ok,
        output: task.result.output,
        durationMs: task.result.durationMs,
        completedAt: task.result.completedAt,
        usage: normalizeTokenUsage(task.result.usage),
        title: task.result.title,
        archivePath: task.result.archivePath,
        profile: task.result.profile,
        cancel: toCancel(task.result.cancel),
      })
    : undefined
  return stripUndefined({
    id: task.id,
    fingerprint: task.fingerprint,
    prompt: task.prompt,
    title: task.title,
    cron: task.cron,
    profile: task.profile,
    status: task.status,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    durationMs: task.durationMs,
    attempts: task.attempts,
    usage,
    archivePath: task.archivePath,
    cancel,
    result,
  }) as Task
}

const toCronJob = (cronJob: z.infer<typeof cronJobRawSchema>): CronJob =>
  stripUndefined({
    id: cronJob.id,
    cron: cronJob.cron,
    scheduledAt: cronJob.scheduledAt,
    prompt: cronJob.prompt,
    title: cronJob.title,
    profile: cronJob.profile,
    enabled: cronJob.enabled,
    createdAt: cronJob.createdAt,
    lastTriggeredAt: cronJob.lastTriggeredAt,
  }) as CronJob

export const parseRuntimeSnapshot = (value: unknown): RuntimeSnapshot => {
  const parsed = runtimeSnapshotRawSchema.parse(value)

  return {
    tasks: parsed.tasks.map((task) => toTask(task)),
    ...(parsed.cronJobs
      ? { cronJobs: parsed.cronJobs.map((job) => toCronJob(job)) }
      : {}),
    ...(parsed.queues ? { queues: parsed.queues } : {}),
  }
}
