import { z } from 'zod'

import { stripUndefined } from '../shared/utils.js'

import { normalizeTokenUsage, tokenUsageSchema } from './token-usage.js'

export const taskCancelSchema = z
  .object({
    source: z.enum(['user', 'deferred', 'system']),
    reason: z.string().optional(),
  })
  .strict()

export const taskResultSchema = z
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

export const taskSchema = z
  .object({
    id: z.string().trim().min(1),
    fingerprint: z.string().trim().min(1),
    prompt: z.string(),
    title: z.string(),
    focusId: z.string().trim().min(1),
    cron: z.string().optional(),
    scheduledAt: z.string().optional(),
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
  .refine(
    (data) => !(data.cron !== undefined && data.scheduledAt !== undefined),
    { message: 'task cron and scheduledAt are mutually exclusive' },
  )

const planTriggerCronSchema = z
  .object({
    mode: z.literal('cron'),
    cron: z.string().trim().min(1),
  })
  .strict()

const planTriggerScheduledAtSchema = z
  .object({
    mode: z.literal('scheduled_at'),
    scheduledAt: z.string().trim().min(1),
  })
  .strict()

const planTriggerOnIdleSchema = z
  .object({
    mode: z.literal('on_idle'),
    cooldownMs: z.number().int().nonnegative(),
  })
  .strict()

export const taskPlanTriggerSchema = z.discriminatedUnion('mode', [
  planTriggerCronSchema,
  planTriggerScheduledAtSchema,
  planTriggerOnIdleSchema,
])

export const taskPlanSchema = z
  .object({
    id: z.string().trim().min(1),
    prompt: z.string(),
    title: z.string(),
    focusId: z.string().trim().min(1),
    profile: z.enum(['worker']),
    priority: z.enum(['high', 'normal', 'low']),
    source: z.enum(['user_request', 'agent_auto', 'retry_decision']),
    status: z.enum(['active', 'blocked', 'done']),
    trigger: taskPlanTriggerSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    runCount: z.number().int().nonnegative(),
    maxRuns: z.number().int().positive().optional(),
    lastTriggeredAt: z.string().optional(),
    lastCompletedAt: z.string().optional(),
    lastTaskId: z.string().trim().min(1).optional(),
    archivedAt: z.string().optional(),
    doneReason: z.enum(['canceled', 'completed', 'exhausted']).optional(),
  })
  .strict()

export const focusMetaSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string(),
    status: z.enum(['active', 'idle', 'done', 'archived']),
    createdAt: z.string(),
    updatedAt: z.string(),
    lastActivityAt: z.string(),
  })
  .strict()

export const focusContextSchema = z
  .object({
    focusId: z.string().trim().min(1),
    summary: z.string().optional(),
    openItems: z.array(z.string()).optional(),
    updatedAt: z.string(),
  })
  .strict()

const memoryRefreshSchema = z
  .object({
    lastCompletedTurn: z.number().int().nonnegative(),
    lastProcessedInputsCursor: z.number().int().nonnegative(),
    lastProcessedResultsCursor: z.number().int().nonnegative(),
    lastProcessedPlanUpdatedAt: z.string().trim().min(1).optional(),
    lastRunAt: z.string().trim().min(1).optional(),
  })
  .strict()

const runtimeSnapshotSchema = z
  .object({
    tasks: z.array(taskSchema),
    taskPlans: z.array(taskPlanSchema),
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
    memoryRefresh: memoryRefreshSchema.optional(),
    managerCompressedContext: z.string().trim().min(1).optional(),
  })
  .strict()

export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>

const normalizeTask = (
  task: z.infer<typeof taskSchema>,
): z.infer<typeof taskSchema> =>
  stripUndefined({
    ...task,
    usage: normalizeTokenUsage(task.usage),
    result: task.result
      ? stripUndefined({
          ...task.result,
          usage: normalizeTokenUsage(task.result.usage),
        })
      : undefined,
  }) as z.infer<typeof taskSchema>

const normalizeTaskPlan = (
  item: z.infer<typeof taskPlanSchema>,
): z.infer<typeof taskPlanSchema> =>
  stripUndefined({ ...item }) as z.infer<typeof taskPlanSchema>

const normalizeFocusMeta = (
  focus: z.infer<typeof focusMetaSchema>,
): z.infer<typeof focusMetaSchema> =>
  stripUndefined({ ...focus }) as z.infer<typeof focusMetaSchema>

const normalizeFocusContext = (
  focusContext: z.infer<typeof focusContextSchema>,
): z.infer<typeof focusContextSchema> =>
  stripUndefined({ ...focusContext }) as z.infer<typeof focusContextSchema>

export const parseRuntimeSnapshot = (value: unknown): RuntimeSnapshot => {
  const parsed = runtimeSnapshotSchema.parse(value)
  return stripUndefined({
    tasks: parsed.tasks.map(normalizeTask),
    taskPlans: parsed.taskPlans.map(normalizeTaskPlan),
    focuses: parsed.focuses?.map(normalizeFocusMeta),
    focusContexts: parsed.focusContexts?.map(normalizeFocusContext),
    activeFocusIds: parsed.activeFocusIds,
    managerTurn: parsed.managerTurn,
    queues: parsed.queues,
    memoryRefresh: parsed.memoryRefresh,
    managerCompressedContext: parsed.managerCompressedContext,
  }) as RuntimeSnapshot
}
