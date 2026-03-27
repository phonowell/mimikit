import type { TaskPlanEffect } from '../../foundation/types/index.js'

export const buildPlanEffectKey = (params: {
  effect: TaskPlanEffect
  focusId: string
}): string =>
  ['enqueue_task', params.effect.taskTemplate.fingerprint].join('\n')
