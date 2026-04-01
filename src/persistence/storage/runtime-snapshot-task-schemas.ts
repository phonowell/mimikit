import { z } from 'zod'

import {
  TASK_CANCEL_SOURCE_VALUES,
  TASK_RESULT_OUTCOME_VALUES,
  TASK_RESULT_STATUS_VALUES,
  TASK_RESULT_STOP_REASON_VALUES,
  TASK_STATUS_VALUES,
  WORKER_PROVIDER_VALUES,
} from '../../foundation/types/runtime-domain.js'
import { TASK_RESOURCE_MODE_VALUES } from '../../work/types/task-runtime-types.js'

import {
  taskGitExecutionSchema,
  taskResultHandoffArtifactSchema,
  taskResultHandoffEvidenceSchema,
} from './runtime-snapshot-task-schema-parts.js'
import { tokenUsageSchema } from './token-usage.js'

const workerProviderSchema = z.enum(WORKER_PROVIDER_VALUES)
const taskStatusSchema = z.enum(TASK_STATUS_VALUES)
const taskResultStatusSchema = z.enum(TASK_RESULT_STATUS_VALUES)
const taskCancelSourceSchema = z.enum(TASK_CANCEL_SOURCE_VALUES)
const taskResultOutcomeSchema = z.enum(TASK_RESULT_OUTCOME_VALUES)
const taskResultStopReasonSchema = z.enum(TASK_RESULT_STOP_REASON_VALUES)
const taskResourceModeSchema = z.enum(TASK_RESOURCE_MODE_VALUES)

export const taskCancelSchema = z
  .object({
    source: taskCancelSourceSchema,
    reason: z.string().optional(),
  })
  .strict()

export const taskContractSchema = z
  .object({
    goal: z.string().trim().min(1),
    scope: z.string().trim().min(1),
    acceptance: z.array(z.string().trim().min(1)).min(1),
    outOfScope: z.string().trim().min(1).optional(),
    contextRefs: z.array(z.string().trim().min(1)).optional(),
  })
  .strict()

export const taskResultHandoffSchema = z
  .object({
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
    status: z.enum(['done', 'failed']),
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
    traceRef: z.string().trim().min(1).optional(),
    providerCallId: z.string().trim().min(1).optional(),
    attempt: z.number().int().positive().optional(),
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
    semanticKey: z.string().trim().min(1),
    executionSpecId: z.string().trim().min(1),
    contract: taskContractSchema.optional(),
    title: z.string(),
    cwd: z.string().trim().min(1),
    resourceMode: taskResourceModeSchema.optional(),
    repoKey: z.string().trim().min(1).optional(),
    branch: z.string().trim().min(1).optional(),
    git: taskGitExecutionSchema.optional(),
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
    resumeInstruction: z.string().trim().min(1).optional(),
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
  .refine(
    (data) =>
      !data.git || (data.repoKey !== undefined && data.branch !== undefined),
    { message: 'task git requires repoKey and branch' },
  )
  .refine((data) => !data.git || data.branch === data.git.branch, {
    message: 'task branch must match task.git.branch',
  })
