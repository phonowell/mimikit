import { buildPlanEnqueueTaskEffect } from './action-plan-effect-enqueue.js'

import type { ManagerTaskDraft } from './manager-turn-schema.js'
import type { TaskPlanEffect } from '../../foundation/types/index.js'

export const buildPlanEffectFromTaskDraft = (params: {
  stateDir: string
  task: ManagerTaskDraft
  focusId: string
}): Promise<TaskPlanEffect> =>
  buildPlanEnqueueTaskEffect({
    stateDir: params.stateDir,
    task: params.task,
    focusId: params.focusId,
  })
