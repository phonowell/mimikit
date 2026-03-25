import type { TaskPlanEffect } from '../../foundation/types/index.js'

export const buildPlanEffectKey = (params: {
  effect: TaskPlanEffect
  focusId: string
}): string =>
  params.effect.kind === 'enqueue_task'
    ? ['enqueue_task', params.effect.taskTemplate.fingerprint].join('\n')
    : `wake_manager\n${params.effect.reason}`
