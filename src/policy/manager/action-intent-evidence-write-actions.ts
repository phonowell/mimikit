import {
  buildAmbiguousWorklineHint,
  buildMissingIntentEvidenceHint,
  isSupportedByInputs,
  type SupplementalEvidenceSource,
} from './action-intent-evidence-match.js'
import {
  requiresExplicitWriteEnqueueLaneEvidence,
  requiresExplicitWritePlanUpdateLaneEvidence,
} from './action-intent-evidence-write-lane.js'
import {
  resolveLowRiskWriteEnqueueContinuation,
  supportsDirectWriteEnqueueContinuationTarget,
  supportsDirectWritePlanUpdateTarget,
} from './action-intent-evidence-write-target.js'
import { buildTaskContractFromDraft } from './task-contract.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type { Task, TaskPlan } from '../../foundation/types/index.js'

const buildMissingWriteIntentEvidenceHint = (
  actionName: Parsed['type'],
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>,
): string =>
  buildMissingIntentEvidenceHint({
    actionName,
    evidenceSources: supplementalEvidenceSources,
  })

const buildEnqueueWriteIntentContext = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  inputTexts: string[]
  taskById?: Map<string, Task>
  planById?: Map<string, TaskPlan>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
}) => ({
  item: params.item,
  inputTexts: params.inputTexts,
  ...(params.taskById ? { taskById: params.taskById } : {}),
  ...(params.planById ? { planById: params.planById } : {}),
  ...(params.resultTaskIds ? { resultTaskIds: params.resultTaskIds } : {}),
  ...(params.defaultFocusId ? { defaultFocusId: params.defaultFocusId } : {}),
})

export const resolveEnqueueTaskIntentEvidenceHint = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  inputTexts: string[]
  taskById?: Map<string, Task>
  planById?: Map<string, TaskPlan>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const enqueueContext = buildEnqueueWriteIntentContext(params)
  const lowRiskContinuation =
    resolveLowRiskWriteEnqueueContinuation(enqueueContext)
  if (lowRiskContinuation.ok) return undefined
  if (lowRiskContinuation.reason === 'ambiguous_workline')
    return buildAmbiguousWorklineHint(lowRiskContinuation.candidateRefs)

  if (supportsDirectWriteEnqueueContinuationTarget(enqueueContext))
    return undefined

  if (requiresExplicitWriteEnqueueLaneEvidence(enqueueContext)) {
    return buildMissingWriteIntentEvidenceHint(
      params.item.type,
      params.supplementalEvidenceSources,
    )
  }

  const contract = buildTaskContractFromDraft(params.item.task)
  if (!contract) return undefined
  if (params.inputTexts.length === 0) {
    return buildMissingWriteIntentEvidenceHint(
      params.item.type,
      params.supplementalEvidenceSources,
    )
  }
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
    : buildMissingWriteIntentEvidenceHint(
        params.item.type,
        params.supplementalEvidenceSources,
      )
}

export const resolveSetPlanIntentEvidenceHint = (params: {
  item: Extract<Parsed, { type: 'set_plan' }>
  inputTexts: string[]
  planById?: Map<string, TaskPlan>
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  if (params.inputTexts.length === 0) {
    return buildMissingWriteIntentEvidenceHint(
      params.item.type,
      params.supplementalEvidenceSources,
    )
  }

  if (
    requiresExplicitWritePlanUpdateLaneEvidence({
      item: params.item,
      inputTexts: params.inputTexts,
      ...(params.planById ? { planById: params.planById } : {}),
    })
  ) {
    return buildMissingWriteIntentEvidenceHint(
      params.item.type,
      params.supplementalEvidenceSources,
    )
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
    : buildMissingWriteIntentEvidenceHint(
        params.item.type,
        params.supplementalEvidenceSources,
      )
}
