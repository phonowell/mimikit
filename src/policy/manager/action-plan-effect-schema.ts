import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)

export const planEffectKindSchema = z.enum(['enqueue_task', 'wake_manager'])
export const wakeManagerReasonSchema = z.enum([
  'scheduled_review',
  'capacity_retry',
  'follow_up',
])

const PLAN_EFFECT_TASK_ATTR_FIELDS = [
  'task_title',
  'task_worker_prompt',
  'task_cwd',
  'task_branch',
  'task_goal',
  'task_in_scope',
  'task_done_when_1',
  'task_done_when_2',
  'task_done_when_3',
  'task_done_when_4',
  'task_done_when_5',
  'task_out_of_scope',
  'task_context_ref_1',
  'task_context_ref_2',
  'task_context_ref_3',
] as const

type PlanEffectTaskAttrField = (typeof PLAN_EFFECT_TASK_ATTR_FIELDS)[number]

export const PLAN_EFFECT_EDITABLE_FIELDS = [
  'effect_kind',
  'effect_reason',
  ...PLAN_EFFECT_TASK_ATTR_FIELDS,
] as const

export const PLAN_EFFECT_DETAIL_FIELDS = [
  'effect_reason',
  ...PLAN_EFFECT_TASK_ATTR_FIELDS,
] as const

const planEffectSharedFields = {
  effect_reason: wakeManagerReasonSchema.optional(),
  task_title: nonEmptyString.optional(),
  task_worker_prompt: nonEmptyString.optional(),
  task_cwd: nonEmptyString.optional(),
  task_branch: nonEmptyString.optional(),
  task_goal: nonEmptyString.optional(),
  task_in_scope: nonEmptyString.optional(),
  task_done_when_1: nonEmptyString.optional(),
  task_done_when_2: nonEmptyString.optional(),
  task_done_when_3: nonEmptyString.optional(),
  task_done_when_4: nonEmptyString.optional(),
  task_done_when_5: nonEmptyString.optional(),
  task_out_of_scope: nonEmptyString.optional(),
  task_context_ref_1: nonEmptyString.optional(),
  task_context_ref_2: nonEmptyString.optional(),
  task_context_ref_3: nonEmptyString.optional(),
} as const

export type PlanEffectAttrs = {
  effect_kind?: z.infer<typeof planEffectKindSchema> | undefined
  effect_reason?: z.infer<typeof wakeManagerReasonSchema> | undefined
} & Partial<Record<PlanEffectTaskAttrField, string | undefined>>

export const planEffectFields = {
  effect_kind: planEffectKindSchema,
  ...planEffectSharedFields,
} as const

export const planEffectUpdateFields = {
  effect_kind: planEffectKindSchema.optional(),
  ...planEffectSharedFields,
} as const

export const validatePlanEffectFields = (
  data: PlanEffectAttrs,
  ctx: z.RefinementCtx,
  addCustomIssue: (ctx: z.RefinementCtx, path: string, message: string) => void,
): void => {
  if (data.effect_kind === 'wake_manager') {
    if (!data.effect_reason) {
      addCustomIssue(
        ctx,
        'effect_reason',
        'effect_reason is required when effect_kind="wake_manager"',
      )
    }
    for (const key of PLAN_EFFECT_TASK_ATTR_FIELDS) {
      if (data[key] !== undefined) {
        addCustomIssue(
          ctx,
          key,
          `${key} cannot be used when effect_kind="wake_manager"`,
        )
      }
    }
    return
  }

  if (!data.task_title) {
    addCustomIssue(
      ctx,
      'task_title',
      'task_title is required when effect_kind="enqueue_task"',
    )
  }
  if (!data.task_cwd) {
    addCustomIssue(
      ctx,
      'task_cwd',
      'task_cwd is required when effect_kind="enqueue_task"',
    )
  }
  if (!data.task_goal) {
    addCustomIssue(
      ctx,
      'task_goal',
      'task_goal is required when effect_kind="enqueue_task"',
    )
  }
  if (!data.task_in_scope) {
    addCustomIssue(
      ctx,
      'task_in_scope',
      'task_in_scope is required when effect_kind="enqueue_task"',
    )
  }
  if (
    !data.task_done_when_1 &&
    !data.task_done_when_2 &&
    !data.task_done_when_3 &&
    !data.task_done_when_4 &&
    !data.task_done_when_5
  ) {
    addCustomIssue(
      ctx,
      'task_done_when_1',
      'at least one task_done_when_{n} is required when effect_kind="enqueue_task"',
    )
  }
  if (data.effect_reason !== undefined) {
    addCustomIssue(
      ctx,
      'effect_reason',
      'effect_reason cannot be used when effect_kind="enqueue_task"',
    )
  }
}
