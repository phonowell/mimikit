import { supportsExplicitSetPlanContinuationAnchor } from './action-continuation-anchor.js'
import {
  buildMissingIntentEvidenceHint,
  isSupportedByInputs,
} from './action-intent-evidence-match.js'
import {
  collectSetPlanCandidates,
  collectSetPlanChangedCandidates,
  hasLooseSetPlanSupport,
  resolveSetPlanReferenceCandidates,
} from './action-intent-evidence-set-plan.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence-source.js'
import type { Task, TaskPlan } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

export const validateSetPlanIntentEvidence = (params: {
  item: Extract<Parsed, { type: 'set_plan' }>
  inputTexts: string[]
  taskById?: Map<string, Task>
  planById?: Map<string, TaskPlan>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const explicitContinuationSupport = supportsExplicitSetPlanContinuationAnchor(
    params.item,
    {
      ...(params.planById ? { planById: params.planById } : {}),
      ...(params.taskById ? { taskById: params.taskById } : {}),
      ...(params.resultTaskIds ? { resultTaskIds: params.resultTaskIds } : {}),
      ...(params.defaultFocusId
        ? { defaultFocusId: params.defaultFocusId }
        : {}),
    },
  )
  if (explicitContinuationSupport !== undefined) {
    if (explicitContinuationSupport) return undefined
    return buildMissingIntentEvidenceHint({
      actionName: params.item.type,
      evidenceSources: params.supplementalEvidenceSources,
    })
  }

  const candidates = collectSetPlanCandidates(params.item)
  const combinedCandidate = [
    params.item.plan.title,
    params.item.plan.task.title,
    params.item.plan.task.goal,
    ...params.item.plan.task.in_scope,
    ...params.item.plan.task.done_when,
  ].join('\n')
  if (
    isSupportedByInputs({
      candidates,
      combinedCandidate,
      inputs: params.inputTexts,
    })
  )
    return undefined

  if (params.item.plan_id !== null) {
    const currentPlan = params.planById?.get(params.item.plan_id)
    const planReferenceCandidates = resolveSetPlanReferenceCandidates(
      params.item,
      currentPlan,
    )
    if (
      planReferenceCandidates.length > 0 &&
      isSupportedByInputs({
        candidates: planReferenceCandidates,
        inputs: params.inputTexts,
      }) &&
      hasLooseSetPlanSupport({
        candidates: collectSetPlanChangedCandidates(params.item, currentPlan),
        inputTexts: params.inputTexts,
      })
    )
      return undefined
  }

  return buildMissingIntentEvidenceHint({
    actionName: params.item.type,
    evidenceSources: params.supplementalEvidenceSources,
  })
}
