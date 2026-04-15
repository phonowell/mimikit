import {
  buildMissingIntentEvidenceHint,
  isSupportedByInputs,
  type SupplementalEvidenceSource,
} from './action-intent-evidence-match.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type { Task, TaskPlan } from '../../foundation/types/index.js'

export const resolveTaskControlIntentEvidenceHint = (params: {
  item: Extract<Parsed, { type: 'task_control' }>
  inputTexts: string[]
  taskById?: Map<string, Task>
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const task = params.taskById?.get(params.item.task_id)
  const supported = isSupportedByInputs({
    candidates: [params.item.task_id, task?.title ?? ''],
    inputs: params.inputTexts,
  })
  const taskRef = task?.title.trim()
    ? `${params.item.task_id} / ${task.title.trim()}`
    : params.item.task_id
  return supported
    ? undefined
    : buildMissingIntentEvidenceHint({
        actionName: params.item.type,
        evidenceSources: params.supplementalEvidenceSources,
        taskRef,
      })
}

export const resolveDeletePlanIntentEvidenceHint = (params: {
  item: Extract<Parsed, { type: 'delete_plan' }>
  inputTexts: string[]
  planById?: Map<string, TaskPlan>
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const plan = params.planById?.get(params.item.plan_id)
  const supported = isSupportedByInputs({
    candidates: [params.item.plan_id, plan?.title ?? ''],
    inputs: params.inputTexts,
  })
  return supported
    ? undefined
    : buildMissingIntentEvidenceHint({
        actionName: params.item.type,
        evidenceSources: params.supplementalEvidenceSources,
      })
}
