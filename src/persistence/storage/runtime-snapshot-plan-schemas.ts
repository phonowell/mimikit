import { z } from 'zod'

import { TASK_PLAN_STATUS_VALUES } from '../../foundation/types/runtime-domain.js'
import { TASK_RESOURCE_MODE_VALUES } from '../../work/types/task-runtime-types.js'

import { taskPlanRuntimeSchema } from './runtime-snapshot-task-schema-parts.js'
import { taskContractSchema } from './runtime-snapshot-task-schemas.js'
const taskPlanStatusSchema = z.enum(TASK_PLAN_STATUS_VALUES)
const taskResourceModeSchema = z.enum(TASK_RESOURCE_MODE_VALUES)

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

const taskPlanEffectSchema = z
  .object({
    kind: z.literal('enqueue_task'),
    taskKey: z.string().trim().min(1).optional(),
    taskContract: taskContractSchema.optional(),
    taskTemplate: z
      .object({
        title: z.string().trim().min(1),
        executionSpecId: z.string().trim().min(1),
        contract: taskContractSchema.optional(),
        fingerprint: z.string().trim().min(1).optional(),
        semanticKey: z.string().trim().min(1).optional(),
        cwd: z.string().trim().min(1),
        resourceMode: taskResourceModeSchema.optional(),
        useWorktree: z.boolean().optional(),
        branch: z.string().trim().min(1).optional(),
      })
      .strict()
      .transform(
        ({
          contract,
          fingerprint,
          semanticKey: _semanticKey,
          ...rest
        }) => ({
          ...rest,
          ...(contract ? { contract } : {}),
          ...(fingerprint ? { fingerprint } : {}),
        }),
      ),
  })
  .transform(({ taskKey, taskContract, taskTemplate, ...rest }) => ({
    ...rest,
    kind: 'enqueue_task' as const,
    taskKey: taskKey ?? taskTemplate.fingerprint,
    ...(taskContract
      ? { taskContract }
      : taskTemplate.contract
        ? { taskContract: taskTemplate.contract }
        : {}),
    taskTemplate: {
      title: taskTemplate.title,
      executionSpecId: taskTemplate.executionSpecId,
      cwd: taskTemplate.cwd,
      ...(taskTemplate.resourceMode
        ? { resourceMode: taskTemplate.resourceMode }
        : {}),
      ...(taskTemplate.useWorktree ? { useWorktree: true } : {}),
      ...(taskTemplate.branch ? { branch: taskTemplate.branch } : {}),
    },
  }))
  .strict()

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
