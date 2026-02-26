import { z } from 'zod'

import { stripUndefined } from '../shared/utils.js'

import { normalizeTokenUsage, tokenUsageSchema } from './token-usage.js'

import type {
  CronJob,
  FocusContext,
  FocusMeta,
  IdleIntent,
  Task,
} from '../types/index.js'

export type RuntimeSnapshot = {
  tasks: Task[]
  cronJobs?: CronJob[]
  idleIntents?: IdleIntent[]
  idleIntentArchive?: IdleIntent[]
  focuses?: FocusMeta[]
  focusContexts?: FocusContext[]
  activeFocusIds?: string[]
  managerTurn?: number
  queues?: {
    inputsCursor: number
    resultsCursor: number
  }
  managerCompressedContext?: string
}

const taskCancelSchema = z
  .object({
    source: z.enum(['user', 'deferred', 'system']),
    reason: z.string().optional(),
  })
  .strict()

const taskResultSchema = z
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
    profile: z.enum(['worker']).optional(),
    cancel: taskCancelSchema.optional(),
  })
  .strict()

const taskSchema = z
  .object({
    id: z.string().trim().min(1),
    fingerprint: z.string().trim().min(1),
    prompt: z.string(),
    title: z.string(),
    focusId: z.string().trim().min(1),
    cron: z.string().optional(),
    profile: z.enum(['worker']),
    status: z.enum(['pending', 'running', 'succeeded', 'failed', 'canceled']),
    createdAt: z.string(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    durationMs: z.number().finite().nonnegative().optional(),
    attempts: z.number().int().nonnegative().optional(),
    usage: tokenUsageSchema.optional(),
    archivePath: z.string().optional(),
    cancel: taskCancelSchema.optional(),
    result: taskResultSchema.optional(),
  })
  .strict()

const cronJobSchema = z
  .object({
    id: z.string().trim().min(1),
    cron: z.string().trim().min(1).optional(),
    scheduledAt: z.string().trim().min(1).optional(),
    prompt: z.string(),
    title: z.string(),
    focusId: z.string().trim().min(1),
    profile: z.enum(['worker']),
    enabled: z.boolean(),
    disabledReason: z.enum(['canceled', 'completed']).optional(),
    createdAt: z.string(),
    lastTriggeredAt: z.string().optional(),
  })
  .strict()
  .refine((data) => data.cron !== undefined || data.scheduledAt !== undefined, {
    message: 'cron or scheduledAt required',
  })
  .refine(
    (data) => !(data.cron !== undefined && data.scheduledAt !== undefined),
    { message: 'cron and scheduledAt are mutually exclusive' },
  )

const idleIntentSchema = z
  .object({
    id: z.string().trim().min(1),
    prompt: z.string(),
    title: z.string(),
    focusId: z.string().trim().min(1),
    priority: z.enum(['high', 'normal', 'low']),
    status: z.enum(['pending', 'blocked', 'done']),
    source: z.enum(['user_request', 'agent_auto', 'retry_decision']),
    createdAt: z.string(),
    updatedAt: z.string(),
    attempts: z.number().int().nonnegative(),
    maxAttempts: z.number().int().positive(),
    lastTaskId: z.string().trim().min(1).optional(),
    archivedAt: z.string().optional(),
  })
  .strict()

const focusMetaSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string(),
    status: z.enum(['active', 'idle', 'done', 'archived']),
    createdAt: z.string(),
    updatedAt: z.string(),
    lastActivityAt: z.string(),
  })
  .strict()

const focusContextSchema = z
  .object({
    focusId: z.string().trim().min(1),
    summary: z.string().optional(),
    openItems: z.array(z.string()).optional(),
    updatedAt: z.string(),
  })
  .strict()

const runtimeSnapshotSchema = z
  .object({
    tasks: z.array(taskSchema),
    cronJobs: z.array(cronJobSchema).optional(),
    idleIntents: z.array(idleIntentSchema).optional(),
    idleIntentArchive: z.array(idleIntentSchema).optional(),
    focuses: z.array(focusMetaSchema).optional(),
    focusContexts: z.array(focusContextSchema).optional(),
    activeFocusIds: z.array(z.string().trim().min(1)).optional(),
    managerTurn: z.number().int().nonnegative().optional(),
    queues: z
      .object({
        inputsCursor: z.number().int().nonnegative(),
        resultsCursor: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    managerCompressedContext: z.string().trim().min(1).optional(),
  })
  .strict()

const normalizeTask = (task: z.infer<typeof taskSchema>): Task =>
  stripUndefined({
    ...task,
    usage: normalizeTokenUsage(task.usage),
    result: task.result
      ? stripUndefined({ ...task.result, usage: normalizeTokenUsage(task.result.usage) })
      : undefined,
  }) as Task

const normalizeCronJob = (cronJob: z.infer<typeof cronJobSchema>): CronJob =>
  stripUndefined({ ...cronJob }) as CronJob

const normalizeIdleIntent = (
  intent: z.infer<typeof idleIntentSchema>,
): IdleIntent => stripUndefined({ ...intent }) as IdleIntent

const normalizeFocusMeta = (
  focus: z.infer<typeof focusMetaSchema>,
): FocusMeta => stripUndefined({ ...focus }) as FocusMeta

const normalizeFocusContext = (
  focusContext: z.infer<typeof focusContextSchema>,
): FocusContext => stripUndefined({ ...focusContext }) as FocusContext

export const parseRuntimeSnapshot = (value: unknown): RuntimeSnapshot => {
  const parsed = runtimeSnapshotSchema.parse(value)
  return stripUndefined({
    tasks: parsed.tasks.map(normalizeTask),
    cronJobs: parsed.cronJobs?.map(normalizeCronJob),
    idleIntents: parsed.idleIntents?.map(normalizeIdleIntent),
    idleIntentArchive: parsed.idleIntentArchive?.map(normalizeIdleIntent),
    focuses: parsed.focuses?.map(normalizeFocusMeta),
    focusContexts: parsed.focusContexts?.map(normalizeFocusContext),
    activeFocusIds: parsed.activeFocusIds,
    managerTurn: parsed.managerTurn,
    queues: parsed.queues,
    managerCompressedContext: parsed.managerCompressedContext,
  }) as RuntimeSnapshot
}
