import { z } from 'zod'

import {
  focusIdSchema,
  planIdSchema,
  taskIdSchema,
} from '../../foundation/shared/id-schema.js'

import {
  managerTaskDraftInstructionsSchema,
  managerTaskDraftParseSchema,
  managerTaskDraftSchema,
} from './task-draft-schema.js'

const s = z.string().trim().min(1)
const optionalInlineString = z.string().trim().optional()

export const managerPlanTriggerSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('cron'),
    cron: s,
    time_zone: s,
  }),
  z.strictObject({
    type: z.literal('scheduled_at'),
    scheduled_at: s,
  }),
  z.strictObject({
    type: z.literal('on_worker_slot_freed'),
  }),
])

export const managerPlanDraftSchema = z.strictObject({
  title: s,
  trigger: managerPlanTriggerSchema,
  task: managerTaskDraftSchema,
  priority: z.enum(['high', 'normal', 'low']),
  max_runs: z.number().int().positive().nullable(),
})

export const managerPlanDraftParseSchema = z.strictObject({
  title: s,
  trigger: managerPlanTriggerSchema,
  task: managerTaskDraftParseSchema,
  priority: z.enum(['high', 'normal', 'low']),
  max_runs: z.number().int().positive().nullable(),
})

export const enqueueTaskActionSchema = z.strictObject({
  type: z.literal('enqueue_task'),
  task: managerTaskDraftSchema,
})

export const enqueueTaskActionParseSchema = z.strictObject({
  type: z.literal('enqueue_task'),
  task: managerTaskDraftParseSchema,
})

export const taskControlActionSchema = z
  .strictObject({
    type: z.literal('task_control'),
    task_id: taskIdSchema,
    action: z.enum(['pause', 'resume', 'cancel']),
    instructions: managerTaskDraftInstructionsSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'resume') return
    if (!value.instructions || value.instructions.length === 0) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['instructions'],
      message: `只有 action="resume" 才允许附带 instructions[]（task_id=${value.task_id}）`,
    })
  })

export const setPlanActionSchema = z.strictObject({
  type: z.literal('set_plan'),
  plan_id: planIdSchema.nullable(),
  plan: managerPlanDraftSchema,
})

export const setPlanActionParseSchema = z.strictObject({
  type: z.literal('set_plan'),
  plan_id: planIdSchema.nullable(),
  plan: managerPlanDraftParseSchema,
})

export const deletePlanActionSchema = z.strictObject({
  type: z.literal('delete_plan'),
  plan_id: planIdSchema,
})

export const assignFocusActionSchema = z.strictObject({
  type: z.literal('assign_focus'),
  target_type: z.enum(['task', 'plan', 'history']),
  target_id: s,
  focus_id: focusIdSchema,
})

export const rememberMemoryActionSchema = z.strictObject({
  type: z.literal('remember_memory'),
  content: s,
  source_input_id: s,
  source_quote: optionalInlineString,
})

export const rememberProjectProfileActionSchema = z.strictObject({
  type: z.literal('remember_project_profile'),
  content: s,
  source_input_id: s,
  source_quote: optionalInlineString,
})

export const managerActionSchema = z.discriminatedUnion('type', [
  enqueueTaskActionSchema,
  taskControlActionSchema,
  setPlanActionSchema,
  deletePlanActionSchema,
  assignFocusActionSchema,
  rememberMemoryActionSchema,
  rememberProjectProfileActionSchema,
])

export const managerTurnSchema = z.strictObject({
  reply: z.string(),
  actions: z.array(managerActionSchema),
})

export const managerActionParseSchema = z.discriminatedUnion('type', [
  enqueueTaskActionParseSchema,
  taskControlActionSchema,
  setPlanActionParseSchema,
  deletePlanActionSchema,
  assignFocusActionSchema,
  rememberMemoryActionSchema,
  rememberProjectProfileActionSchema,
])

export const managerTurnParseSchema = z.strictObject({
  reply: z.string(),
  actions: z.array(managerActionParseSchema),
})

export type ManagerTurnAction = z.infer<typeof managerActionSchema>
export type ManagerTaskDraft = z.infer<typeof managerTaskDraftSchema>
export type ManagerPlanDraft = z.infer<typeof managerPlanDraftSchema>
