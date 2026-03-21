import { z } from 'zod'

import {
  choiceIdSchema,
  focusIdSchema,
  optionIdSchema,
} from '../shared/id-schema.js'
import {
  FOCUS_STATUS_VALUES,
  MANAGER_WAKE_PROFILE_VALUES,
  TASK_CANCEL_SOURCE_VALUES,
  TASK_PLAN_STATUS_VALUES,
  TASK_RESULT_OUTCOME_VALUES,
  TASK_RESULT_STATUS_VALUES,
  TASK_RESULT_STOP_REASON_VALUES,
  TASK_STATUS_VALUES,
  WORKER_PROVIDER_VALUES,
} from '../types/runtime-domain.js'

import {
  managerPacketModeSchema,
  managerPacketSectionSchema,
  managerSectionDigestSchema,
} from './manager-packet-schema.js'
import { tokenUsageSchema } from './token-usage.js'

export {
  managerPacketModeSchema,
  managerPacketSectionSchema,
} from './manager-packet-schema.js'

const workerProviderSchema = z.enum(WORKER_PROVIDER_VALUES)
const taskStatusSchema = z.enum(TASK_STATUS_VALUES)
const taskResultStatusSchema = z.enum(TASK_RESULT_STATUS_VALUES)
const taskCancelSourceSchema = z.enum(TASK_CANCEL_SOURCE_VALUES)
const taskResultOutcomeSchema = z.enum(TASK_RESULT_OUTCOME_VALUES)
const taskResultStopReasonSchema = z.enum(TASK_RESULT_STOP_REASON_VALUES)
const taskPlanStatusSchema = z.enum(TASK_PLAN_STATUS_VALUES)
const focusStatusSchema = z.enum(FOCUS_STATUS_VALUES)
const managerWakeProfileSchema = z.enum(MANAGER_WAKE_PROFILE_VALUES)

export const taskCancelSchema = z
  .object({
    source: taskCancelSourceSchema,
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

const taskGitExecutionSchema = z
  .object({
    worktreePath: z.string().trim().min(1),
    branch: z.string().trim().min(1),
  })
  .strict()

export const taskResultHandoffSchema = z
  .object({
    goal: z.string().trim().min(1).optional(),
    summary: z.string().trim().min(1).optional(),
    decisions: z.array(z.string().trim().min(1)).optional(),
    nextSteps: z.array(z.string().trim().min(1)).optional(),
    risks: z.array(z.string().trim().min(1)).optional(),
    git: taskGitExecutionSchema.optional(),
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

export const taskEvidenceSchema = z
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
    outcome: taskResultOutcomeSchema.optional(),
    stopReason: taskResultStopReasonSchema.optional(),
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
    cwd: z.string().trim().min(1),
    repoKey: z.string().trim().min(1).optional(),
    branch: z.string().trim().min(1).optional(),
    git: taskGitExecutionSchema.optional(),
    contract: taskContractSchema.optional(),
    focusId: z.string().trim().min(1),
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
    (data) =>
      (data.repoKey === undefined && data.branch === undefined) ||
      (data.repoKey !== undefined && data.branch !== undefined),
    { message: 'task repoKey and branch must be provided together' },
  )

const planTriggerCronSchema = z
  .object({
    mode: z.literal('cron'),
    cron: z.string().trim().min(1),
    timeZone: z.string().trim().min(1).optional(),
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

const taskPlanEnqueueTaskEffectSchema = z
  .object({
    kind: z.literal('enqueue_task'),
    taskTemplate: z
      .object({
        title: z.string().trim().min(1),
        prompt: z.string().trim().min(1),
        cwd: z.string().trim().min(1),
        branch: z.string().trim().min(1).optional(),
        contract: taskContractSchema,
      })
      .strict(),
  })
  .strict()

const taskPlanWakeManagerEffectSchema = z
  .object({
    kind: z.literal('wake_manager'),
    reason: z.enum(['scheduled_review', 'capacity_retry', 'follow_up']),
  })
  .strict()

const taskPlanEffectSchema = z.discriminatedUnion('kind', [
  taskPlanEnqueueTaskEffectSchema,
  taskPlanWakeManagerEffectSchema,
])

export const taskPlanSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string(),
    focusId: z.string().trim().min(1),
    priority: z.enum(['high', 'normal', 'low']),
    status: taskPlanStatusSchema,
    trigger: taskPlanTriggerSchema,
    effect: taskPlanEffectSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    runCount: z.number().int().nonnegative(),
    maxRuns: z.number().int().positive().optional(),
    lastTriggeredAt: z.string().optional(),
    lastTaskId: z.string().trim().min(1).optional(),
    closedAt: z.string().optional(),
    doneReason: z.enum(['canceled', 'completed', 'exhausted']).optional(),
  })
  .strict()

export const focusMetaSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string(),
    status: focusStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    lastActivityAt: z.string(),
    summary: z.string().trim().min(1).optional(),
    openItems: z.array(z.string().trim().min(1)).optional(),
  })
  .strict()

export const managerContextPacketSchema = z
  .object({
    id: z.string().trim().min(1),
    createdAt: z.string().trim().min(1),
    wakeProfile: managerWakeProfileSchema,
    mode: managerPacketModeSchema,
    counts: z
      .object({
        inputs: z.number().int().nonnegative(),
        results: z.number().int().nonnegative(),
        tasks: z.number().int().nonnegative(),
        plans: z.number().int().nonnegative(),
        workingFocuses: z.number().int().nonnegative(),
      })
      .strict(),
    latestUserInput: z
      .object({
        id: z.string().trim().min(1),
        focusId: focusIdSchema,
        text: z.string().trim().min(1),
      })
      .strict()
      .optional(),
    latestResult: z
      .object({
        taskId: z.string().trim().min(1),
        status: taskResultStatusSchema,
        focusId: focusIdSchema.optional(),
        summary: z.string().trim().min(1).optional(),
        stopReason: z.string().trim().min(1).optional(),
        archivePath: z.string().trim().min(1).optional(),
      })
      .strict()
      .optional(),
    activeTaskIds: z.array(z.string().trim().min(1)).optional(),
    activePlanIds: z.array(z.string().trim().min(1)).optional(),
    workingFocusIds: z.array(focusIdSchema).optional(),
    sectionDigests: z.array(managerSectionDigestSchema).optional(),
    includedSections: z.array(managerPacketSectionSchema),
    prunedSections: z.array(managerPacketSectionSchema),
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
        message:
          'pendingUserChoices item defaultOptionId must exist in options',
      })
    }
  })

export const pendingUserChoicesSchema = z.array(pendingUserChoiceSchema)

const memoryRefreshSchema = z
  .object({
    lastCompletedTurn: z.number().int().nonnegative(),
    lastProcessedInputsCursor: z.number().int().nonnegative(),
    lastProcessedResultsCursor: z.number().int().nonnegative(),
    lastProcessedPlanUpdatedAt: z.string().trim().min(1).optional(),
    lastRunAt: z.string().trim().min(1).optional(),
  })
  .strict()

const channelTargetsSchema = z
  .object({
    telegramChatId: z.string().trim().min(1).optional(),
    feishuChatId: z.string().trim().min(1).optional(),
  })
  .strict()

export const runtimeSnapshotSchema = z
  .object({
    schemaVersion: z.string().trim().min(1),
    tasks: z.array(taskSchema),
    taskPlans: z.array(taskPlanSchema),
    focuses: z.array(focusMetaSchema).optional(),
    managerTurn: z.number().int().nonnegative().optional(),
    managerThreadId: z.string().trim().min(1).optional(),
    queues: z
      .object({
        inputsCursor: z.number().int().nonnegative(),
        resultsCursor: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    channelTargets: channelTargetsSchema.optional(),
    pendingUserChoices: pendingUserChoicesSchema.optional(),
    memoryRefresh: memoryRefreshSchema.optional(),
  })
  .strict()

export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>
