import { z } from 'zod'

import { TASK_PLAN_STATUS_VALUES } from '../../foundation/types/runtime-domain.js'

import { taskPlanRuntimeSchema } from './runtime-snapshot-task-schema-parts.js'
import { taskContractSchema } from './runtime-snapshot-task-schemas.js'

const taskPlanStatusSchema = z.enum(TASK_PLAN_STATUS_VALUES)

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
    maxRuns: z.number().int().positive().optional(),
    runtime: taskPlanRuntimeSchema,
  })
  .strict()
