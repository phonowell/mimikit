import {
  buildMissingIntentEvidenceHint,
  isSupportedByInputs,
} from './action-intent-evidence-match.js'
import {
  requiresExplicitWriteEnqueueLaneEvidence,
  requiresExplicitWritePlanUpdateLaneEvidence,
} from './action-intent-evidence-write-lane.js'
import {
  supportsDirectWriteEnqueueContinuationTarget,
  supportsDirectWritePlanUpdateTarget,
} from './action-intent-evidence-write-target.js'
import { buildTaskContractFromDraft } from './task-contract.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence-source.js'
import type { Task, TaskPlan } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

export const resolveEnqueueTaskIntentEvidenceHint = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  inputTexts: string[]
  taskById?: Map<string, Task>
  planById?: Map<string, TaskPlan>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  if (
    supportsDirectWriteEnqueueContinuationTarget({
      item: params.item,
      inputTexts: params.inputTexts,
      ...(params.taskById ? { taskById: params.taskById } : {}),
      ...(params.planById ? { planById: params.planById } : {}),
      ...(params.resultTaskIds ? { resultTaskIds: params.resultTaskIds } : {}),
      ...(params.defaultFocusId
        ? { defaultFocusId: params.defaultFocusId }
        : {}),
    })
  )
    return undefined

  if (
    requiresExplicitWriteEnqueueLaneEvidence({
      item: params.item,
      inputTexts: params.inputTexts,
      ...(params.taskById ? { taskById: params.taskById } : {}),
      ...(params.planById ? { planById: params.planById } : {}),
      ...(params.resultTaskIds ? { resultTaskIds: params.resultTaskIds } : {}),
      ...(params.defaultFocusId
        ? { defaultFocusId: params.defaultFocusId }
        : {}),
    })
  ) {
    return buildMissingIntentEvidenceHint({
      actionName: params.item.type,
      evidenceSources: params.supplementalEvidenceSources,
    })
  }

  const contract = buildTaskContractFromDraft(params.item.task)
  if (!contract) return undefined
  const supported = isSupportedByInputs({
    candidates: [params.item.task.title, contract.goal, contract.scope],
    combinedCandidate: [
      params.item.task.title,
      contract.goal,
      ...params.item.task.in_scope,
    ].join('\n'),
    inputs: params.inputTexts,
  })
  return supported
    ? undefined
    : buildMissingIntentEvidenceHint({
        actionName: params.item.type,
        evidenceSources: params.supplementalEvidenceSources,
      })
}

export const resolveSetPlanIntentEvidenceHint = (params: {
  item: Extract<Parsed, { type: 'set_plan' }>
  inputTexts: string[]
  planById?: Map<string, TaskPlan>
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  if (
    requiresExplicitWritePlanUpdateLaneEvidence({
      item: params.item,
      inputTexts: params.inputTexts,
      ...(params.planById ? { planById: params.planById } : {}),
    })
  ) {
    return buildMissingIntentEvidenceHint({
      actionName: params.item.type,
      evidenceSources: params.supplementalEvidenceSources,
    })
  }

  if (
    supportsDirectWritePlanUpdateTarget({
      item: params.item,
      inputTexts: params.inputTexts,
      ...(params.planById ? { planById: params.planById } : {}),
    })
  )
    return undefined

  const supported = isSupportedByInputs({
    candidates: [
      params.item.plan_id ?? '',
      params.item.plan.title,
      params.item.plan.task.title,
      params.item.plan.task.goal,
    ],
    combinedCandidate: [
      params.item.plan.title,
      params.item.plan.task.title,
      params.item.plan.task.goal,
      ...params.item.plan.task.in_scope,
    ].join('\n'),
    inputs: params.inputTexts,
  })
  return supported
    ? undefined
    : buildMissingIntentEvidenceHint({
        actionName: params.item.type,
        evidenceSources: params.supplementalEvidenceSources,
      })
}
