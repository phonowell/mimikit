import { z } from 'zod'

import {
  choiceIdSchema,
  focusIdSchema,
  optionIdSchema,
} from '../shared/id-schema.js'

import { RUNTIME_SNAPSHOT_SCHEMA_VERSION } from './runtime-schema-version.js'
import { tokenUsageSchema } from './token-usage.js'

const workerProviderSchema = z.enum(['codex', 'opencode'])
const taskStatusSchema = z.enum([
  'pending',
  'paused',
  'running',
  'succeeded',
  'failed',
  'canceled',
])
const taskResultStatusSchema = z.enum([
  'succeeded',
  'failed',
  'canceled',
  'partial',
])

export const taskCancelSchema = z
  .object({
    source: z.enum(['user', 'deferred', 'system']),
    reason: z.string().optional(),
  })
  .strict()

const taskContractSchema = z
  .object({
    goal: z.string().trim().min(1),
    scope: z.string().trim().min(1),
    acceptance: z.array(z.string().trim().min(1)).min(1),
    outOfScope: z.string().trim().min(1).optional(),
    contextRefs: z.array(z.string().trim().min(1)).optional(),
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

const taskEvidenceAcceptanceSchema = z
  .object({
    criterion: z.string().trim().min(1),
    met: z.boolean(),
    note: z.string().trim().min(1).optional(),
  })
  .strict()

const taskEvidenceSchema = z
  .object({
    status: z.enum(['done', 'partial', 'failed']),
    contractGoal: z.string().trim().min(1),
    acceptanceChecks: z.array(taskEvidenceAcceptanceSchema).min(1),
    stateDelta: z
      .object({
        taskStatusFrom: taskStatusSchema.optional(),
        taskStatusTo: taskStatusSchema,
        archivePath: z.string().trim().min(1).optional(),
      })
      .strict(),
    nextSteps: z.array(z.string().trim().min(1)).optional(),
    risks: z.array(z.string().trim().min(1)).optional(),
  })
  .strict()

export const taskResultSchema = z
  .object({
    taskId: z.string().trim().min(1),
    status: taskResultStatusSchema,
    ok: z.boolean(),
    output: z.string(),
    durationMs: z.number().finite().nonnegative(),
    completedAt: z.string(),
    taskStatus: taskStatusSchema.optional(),
    outcome: z.enum(['completed', 'partial', 'blocked']).optional(),
    stopReason: z
      .enum([
        'completed',
        'budget_exhausted',
        'guard_rejected',
        'input_required',
        'failed',
        'canceled',
      ])
      .optional(),
    usage: tokenUsageSchema.optional(),
    title: z.string().optional(),
    archivePath: z.string().optional(),
    profile: z.enum(['worker']).optional(),
    provider: workerProviderSchema.optional(),
    cancel: taskCancelSchema.optional(),
    handoff: taskResultHandoffSchema.optional(),
    evidence: taskEvidenceSchema.optional(),
  })
  .strict()

export const taskSchema = z
  .object({
    id: z.string().trim().min(1),
    fingerprint: z.string().trim().min(1),
    prompt: z.string(),
    title: z.string(),
    contract: taskContractSchema.optional(),
    focusId: z.string().trim().min(1),
    cron: z.string().optional(),
    scheduledAt: z.string().optional(),
    profile: z.enum(['worker']),
    provider: workerProviderSchema,
    status: taskStatusSchema,
    createdAt: z.string(),
    startedAt: z.string().optional(),
    pausedAt: z.string().optional(),
    completedAt: z.string().optional(),
    durationMs: z.number().finite().nonnegative().optional(),
    attempts: z.number().int().nonnegative().optional(),
    usage: tokenUsageSchema.optional(),
    sessionId: z.string().trim().min(1).optional(),
    sessionState: z.enum(['reusable', 'discarded']).optional(),
    sessionUpdatedAt: z.string().trim().min(1).optional(),
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

const planTriggerOnWorkerSlotFreedSchema = z
  .object({
    mode: z.literal('on_worker_slot_freed'),
  })
  .strict()

export const taskPlanTriggerSchema = z.discriminatedUnion('mode', [
  planTriggerCronSchema,
  planTriggerScheduledAtSchema,
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
    focusId: focusIdSchema,
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
    id: optionIdSchema,
    label: z.string().trim().min(1),
    reason: z.string().trim().min(1),
  })
  .strict()

export const pendingUserChoiceEffectSchema = z
  .object({
    type: z.literal('resume_task'),
    taskId: z.string().trim().min(1),
    optionId: optionIdSchema,
    reason: z.string().trim().min(1).optional(),
  })
  .strict()

export const pendingUserChoiceSchema = z
  .object({
    id: choiceIdSchema,
    question: z.string().trim().min(1),
    options: z.array(userChoiceOptionSchema).min(2),
    defaultOptionId: optionIdSchema,
    createdAt: z.string().trim().min(1),
    expiresAt: z.string().trim().min(1).optional(),
    focusId: focusIdSchema,
    effect: pendingUserChoiceEffectSchema.optional(),
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
    schemaVersion: z
      .string()
      .trim()
      .min(1)
      .default(RUNTIME_SNAPSHOT_SCHEMA_VERSION),
    tasks: z.array(taskSchema),
    taskPlans: z.array(taskPlanSchema),
    focuses: z.array(focusMetaSchema).optional(),
    focusContexts: z.array(focusContextSchema).optional(),
    managerTurn: z.number().int().nonnegative().optional(),
    managerThreadId: z.string().trim().min(1).optional(),
    queues: z
      .object({
        inputsCursor: z.number().int().nonnegative(),
        resultsCursor: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    pendingUserChoice: pendingUserChoiceSchema.optional(),
    memoryRefresh: memoryRefreshSchema.optional(),
    managerCompressedContext: z.string().optional(),
    managerFocusCompressedContexts: z
      .array(managerFocusCompressedContextSchema)
      .optional(),
  })
  .strict()

export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>
