import { z } from 'zod'

const s = z.string().trim().min(1)
const nullableString = s.nullable()
const nullableInt = z.number().int().positive().nullable()
const nullablePriority = z.enum(['high', 'normal', 'low']).nullable()
const nullablePlanStatus = z.enum(['active', 'blocked', 'done']).nullable()
const doneWhenSchema = z.array(s).min(1).max(5)
const contextRefsSchema = z.array(s).max(3)
const wakeReasonSchema = z
  .enum(['scheduled_review', 'capacity_retry', 'follow_up'])
  .nullable()

const enqueueTaskSchema = z.strictObject({
  type: z.literal('enqueue_task'),
  title: s,
  cwd: s,
  resource_mode: z.enum(['read', 'write']).nullable(),
  branch: nullableString,
  focus_id: nullableString,
  worker_prompt: nullableString,
  goal: s,
  in_scope: s,
  out_of_scope: nullableString,
  done_when: doneWhenSchema,
  context_refs: contextRefsSchema,
})

const mutateTaskSchema = z.strictObject({
  type: z.literal('mutate_task'),
  id: s,
  op: z.enum([
    'pause',
    'resume',
    'cancel',
    'review_passed',
    'merged',
    'cleaned',
  ]),
  reason: nullableString,
  sha: nullableString,
  resume_instruction: nullableString,
})

const createPlanSchema = z.strictObject({
  type: z.literal('create_plan'),
  title: s,
  schedule_type: z.enum(['cron', 'scheduled_at', 'on_worker_slot_freed']),
  cron_expr: nullableString,
  scheduled_at: nullableString,
  time_zone: nullableString,
  max_runs: nullableInt,
  priority: nullablePriority,
  focus_id: nullableString,
  effect_kind: z.enum(['enqueue_task', 'wake_manager']),
  effect_reason: wakeReasonSchema,
  task_title: nullableString,
  task_worker_prompt: nullableString,
  task_cwd: nullableString,
  task_resource_mode: z.enum(['read', 'write']).nullable(),
  task_branch: nullableString,
  task_goal: nullableString,
  task_in_scope: nullableString,
  task_out_of_scope: nullableString,
  task_done_when: z.array(s).max(5),
  task_context_refs: contextRefsSchema,
})

const updatePlanSchema = z.strictObject({
  type: z.literal('update_plan'),
  id: s,
  title: nullableString,
  schedule_type: z
    .enum(['cron', 'scheduled_at', 'on_worker_slot_freed'])
    .nullable(),
  cron_expr: nullableString,
  scheduled_at: nullableString,
  time_zone: nullableString,
  max_runs: nullableInt,
  priority: nullablePriority,
  status: nullablePlanStatus,
  focus_id: nullableString,
  effect_kind: z.enum(['enqueue_task', 'wake_manager']).nullable(),
  effect_reason: wakeReasonSchema,
  task_title: nullableString,
  task_worker_prompt: nullableString,
  task_cwd: nullableString,
  task_resource_mode: z.enum(['read', 'write']).nullable(),
  task_branch: nullableString,
  task_goal: nullableString,
  task_in_scope: nullableString,
  task_out_of_scope: nullableString,
  task_done_when: z.array(s).max(5),
  task_context_refs: contextRefsSchema,
})

export const managerActionSchema = z.discriminatedUnion('type', [
  enqueueTaskSchema,
  mutateTaskSchema,
  z.strictObject({ type: z.literal('restart_runtime'), reason: s }),
  z.strictObject({
    type: z.literal('set_task_result_summary'),
    task_id: s,
    summary: s,
  }),
  createPlanSchema,
  updatePlanSchema,
  z.strictObject({ type: z.literal('delete_plan'), id: s }),
  z.strictObject({
    type: z.literal('ask_user_choice'),
    id: s,
    question: s,
    default_option_id: s,
    focus_id: nullableString,
    options: z
      .array(
        z.strictObject({
          id: s,
          label: s,
          reason: s,
        }),
      )
      .min(2),
  }),
  z.strictObject({
    type: z.literal('upsert_focus'),
    id: s,
    title: nullableString,
    status: z.enum(['active', 'idle', 'done', 'archived']).nullable(),
    summary: nullableString,
    open_items: z.array(s),
  }),
  z.strictObject({
    type: z.literal('assign_focus'),
    target_type: z.enum(['task', 'plan', 'history']),
    target_id: s,
    focus_id: s,
  }),
  z.strictObject({ type: z.literal('remember_memory'), content: s }),
])

export const managerTurnSchema = z.strictObject({
  version: z.literal('manager-turn/v1'),
  reply_text: z.string(),
  actions: z.array(managerActionSchema),
})

export type ManagerTurnAction = z.infer<typeof managerActionSchema>
