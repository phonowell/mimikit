import {
  buildPlanEnqueueTaskEffect,
  resolveUpdatedPlanEnqueueTaskEffect,
} from './action-plan-effect-enqueue.js'

import type { PlanEffectAttrs } from './action-plan-effect-schema.js'
import type { TaskPlanEffect } from '../../foundation/types/index.js'

const resolveWakeManagerReason = (
  value: string | undefined,
  fallback: 'scheduled_review' | 'capacity_retry' | 'follow_up',
): 'scheduled_review' | 'capacity_retry' | 'follow_up' =>
  (value?.trim() ?? fallback) as
    | 'scheduled_review'
    | 'capacity_retry'
    | 'follow_up'

export const buildPlanEffect = (params: {
  stateDir: string
  attrs: PlanEffectAttrs
  focusId: string
}): Promise<TaskPlanEffect> => {
  if (params.attrs.effect_kind === 'wake_manager') {
    return Promise.resolve({
      kind: 'wake_manager',
      reason: resolveWakeManagerReason(params.attrs.effect_reason, 'follow_up'),
    })
  }
  return buildPlanEnqueueTaskEffect(params)
}

export const resolveUpdatedEffect = (params: {
  stateDir: string
  current: TaskPlanEffect
  update: PlanEffectAttrs
  focusId: string
}): Promise<TaskPlanEffect> => {
  const nextKind = params.update.effect_kind ?? params.current.kind
  if (nextKind === 'wake_manager') {
    return Promise.resolve({
      kind: 'wake_manager',
      reason: resolveWakeManagerReason(
        params.update.effect_reason,
        params.current.kind === 'wake_manager'
          ? params.current.reason
          : 'follow_up',
      ),
    })
  }
  if (params.current.kind !== 'enqueue_task') {
    return buildPlanEnqueueTaskEffect({
      stateDir: params.stateDir,
      attrs: params.update,
      focusId: params.focusId,
    })
  }
  return resolveUpdatedPlanEnqueueTaskEffect({
    stateDir: params.stateDir,
    current: params.current,
    update: params.update,
    focusId: params.focusId,
  })
}
