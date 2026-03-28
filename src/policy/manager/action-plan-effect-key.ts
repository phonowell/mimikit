import type { TaskPlanEffect } from '../../foundation/types/index.js'

export const buildPlanEffectKey = (params: {
  effect: TaskPlanEffect
}): string => ['enqueue_task', params.effect.taskKey].join('\n')
