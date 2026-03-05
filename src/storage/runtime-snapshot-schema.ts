import { z } from 'zod'

import { tokenUsageSchema } from './token-usage.js'

export const taskCancelSchema = z
  .object({
    source: z.enum(['user', 'deferred', 'system']),
    reason: z.string().optional(),
  })
  .strict()

const taskResultHandoffArtifactSchema = z
  .object({
    path: z.string().trim().min(1),
    kind: z.string().trim().min(1).optional(),
    note: z.string().trim().min(1).optional(),
  })
  .strict()

const taskResultHandoffEvidenceSchema = z
  .object({
    type: z.enum(['task_archive', 'file', 'history']),
    ref: z.string().trim().min(1),
    note: z.string().trim().min(1).optional(),
  })
  .strict()

const taskResultHandoffSchema = z
  .object({
    goal: z.string().trim().min(1).optional(),
    summary: z.string().trim().min(1).optional(),
    decisions: z.array(z.string().trim().min(1)).optional(),
    nextSteps: z.array(z.string().trim().min(1)).optional(),
    risks: z.array(z.string().trim().min(1)).optional(),
    artifacts: z.array(taskResultHandoffArtifactSchema).optional(),
    evidence: z.array(taskResultHandoffEvidenceSchema).optional(),
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
    handoff: taskResultHandoffSchema.optional(),
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

const planTriggerOnWorkerSlotFreedSchema = z
  .object({
    mode: z.literal('on_worker_slot_freed'),
  })
  .strict()

export const taskPlanTriggerSchema = z.discriminatedUnion('mode', [
  planTriggerCronSchema,
  planTriggerScheduledAtSchema,
  planTriggerOnIdleSchema,
  planTriggerOnWorkerSlotFreedSchema,
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

export const managerFocusCompressedContextSchema = z
  .object({
    focusId: z
      .string()
      .trim()
      .regex(/^focus-[a-zA-Z0-9._-]+$/),
    summary: z.string().trim().min(1),
    updatedAt: z.string().trim().min(1),
    firstKeptEntryId: z.string().trim().min(1).optional(),
    details: z
      .object({
        historyFrom: z.string().trim().min(1).optional(),
        historyTo: z.string().trim().min(1).optional(),
        messageCount: z.number().int().nonnegative().optional(),
        taskIds: z.array(z.string().trim().min(1)).optional(),
        archivePaths: z.array(z.string().trim().min(1)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const userChoiceOptionSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^option-[a-zA-Z0-9._-]+$/),
    label: z.string().trim().min(1),
    reason: z.string().trim().min(1),
  })
  .strict()

export const pendingUserChoiceSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^choice-[a-zA-Z0-9._-]+$/),
    question: z.string().trim().min(1),
    options: z.array(userChoiceOptionSchema).min(2),
    defaultOptionId: z
      .string()
      .trim()
      .regex(/^option-[a-zA-Z0-9._-]+$/),
    createdAt: z.string().trim().min(1),
    expiresAt: z.string().trim().min(1),
    focusId: z
      .string()
      .trim()
      .regex(/^focus-[a-zA-Z0-9._-]+$/),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.options.some((item) => item.id === value.defaultOptionId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pendingUserChoice defaultOptionId must exist in options',
      })
    }
  })

const memoryRefreshSchema = z
  .object({
    lastCompletedTurn: z.number().int().nonnegative(),
    lastProcessedInputsCursor: z.number().int().nonnegative(),
    lastProcessedResultsCursor: z.number().int().nonnegative(),
    lastProcessedPlanUpdatedAt: z.string().trim().min(1).optional(),
    lastRunAt: z.string().trim().min(1).optional(),
  })
  .strict()

export const runtimeSnapshotSchema = z
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
    pendingUserChoice: pendingUserChoiceSchema.optional(),
    memoryRefresh: memoryRefreshSchema.optional(),
    managerFocusCompressedContexts: z
      .array(managerFocusCompressedContextSchema)
      .optional(),
  })
  .strict()

export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>
