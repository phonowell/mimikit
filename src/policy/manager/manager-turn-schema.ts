import { z } from 'zod'

import {
  focusIdSchema,
  planIdSchema,
  taskIdSchema,
} from '../../foundation/shared/id-schema.js'

const s = z.string().trim().min(1)
const list = (max: number, min = 0) => z.array(s).min(min).max(max)
const instructionsSchema = z.array(s).max(3)

export const managerTaskDraftSchema = z
  .strictObject({
    title: s,
    cwd: s,
    mode: z.enum(['read', 'write']),
    use_worktree: z.boolean().default(false),
    goal: s,
    in_scope: list(5, 1),
    out_of_scope: list(5),
    done_when: list(5, 1),
    context_refs: z.array(s).max(5),
    instructions: instructionsSchema,
  })
  .refine((draft) => draft.mode === 'write' || draft.use_worktree !== true, {
    message: '`task.use_worktree` 仅允许用于 `mode="write"` 的任务。',
    path: ['use_worktree'],
  })

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

export const enqueueTaskActionSchema = z.strictObject({
  type: z.literal('enqueue_task'),
  task: managerTaskDraftSchema,
})

export const taskControlActionSchema = z.strictObject({
  type: z.literal('task_control'),
  task_id: taskIdSchema,
  action: z.enum(['pause', 'resume', 'cancel']),
  instructions: instructionsSchema,
})

export const recordTaskGitActionSchema = z.strictObject({
  type: z.literal('record_task_git'),
  task_id: taskIdSchema,
  state: z.enum(['review_passed', 'merged', 'cleaned']),
  source_input_id: s,
  source_quote: s,
})

export const setPlanActionSchema = z.strictObject({
  type: z.literal('set_plan'),
  plan_id: planIdSchema.nullable(),
  plan: managerPlanDraftSchema,
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
  source_quote: s,
})

export const rememberProjectProfileActionSchema = z.strictObject({
  type: z.literal('remember_project_profile'),
  content: s,
  source_input_id: s,
  source_quote: s,
})

export const managerActionSchema = z.discriminatedUnion('type', [
  enqueueTaskActionSchema,
  taskControlActionSchema,
  recordTaskGitActionSchema,
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

export type ManagerTurnAction = z.infer<typeof managerActionSchema>
export type ManagerTaskDraft = z.infer<typeof managerTaskDraftSchema>
export type ManagerPlanDraft = z.infer<typeof managerPlanDraftSchema>
