export type NormalizedPlanEffectAttrs = {
  effect_kind?: 'enqueue_task' | 'wake_manager' | undefined
  effect_reason?:
    | 'scheduled_review'
    | 'capacity_retry'
    | 'follow_up'
    | undefined
  task_title?: string | undefined
  task_worker_prompt?: string | undefined
  task_cwd?: string | undefined
  task_branch?: string | undefined
  task_goal?: string | undefined
  task_in_scope?: string | undefined
  task_done_when_1?: string | undefined
  task_done_when_2?: string | undefined
  task_done_when_3?: string | undefined
  task_done_when_4?: string | undefined
  task_done_when_5?: string | undefined
  task_out_of_scope?: string | undefined
  task_context_ref_1?: string | undefined
  task_context_ref_2?: string | undefined
  task_context_ref_3?: string | undefined
}

export const normalizePlanEffectAttrs = (
  value: Record<string, unknown>,
): NormalizedPlanEffectAttrs => ({
  effect_kind: value.effect_kind as NormalizedPlanEffectAttrs['effect_kind'],
  effect_reason:
    value.effect_reason as NormalizedPlanEffectAttrs['effect_reason'],
  task_title: value.task_title as string | undefined,
  task_worker_prompt: (value.task_worker_prompt ?? value.task_prompt) as
    | string
    | undefined,
  task_cwd: value.task_cwd as string | undefined,
  task_branch: value.task_branch as string | undefined,
  task_goal: value.task_goal as string | undefined,
  task_in_scope: (value.task_in_scope ?? value.task_scope) as
    | string
    | undefined,
  task_done_when_1: (value.task_done_when_1 ?? value.task_acceptance_1) as
    | string
    | undefined,
  task_done_when_2: (value.task_done_when_2 ?? value.task_acceptance_2) as
    | string
    | undefined,
  task_done_when_3: (value.task_done_when_3 ?? value.task_acceptance_3) as
    | string
    | undefined,
  task_done_when_4: (value.task_done_when_4 ?? value.task_acceptance_4) as
    | string
    | undefined,
  task_done_when_5: (value.task_done_when_5 ?? value.task_acceptance_5) as
    | string
    | undefined,
  task_out_of_scope: value.task_out_of_scope as string | undefined,
  task_context_ref_1: value.task_context_ref_1 as string | undefined,
  task_context_ref_2: value.task_context_ref_2 as string | undefined,
  task_context_ref_3: value.task_context_ref_3 as string | undefined,
})
