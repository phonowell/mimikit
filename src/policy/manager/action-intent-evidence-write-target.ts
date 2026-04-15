import {
  collectPlanCandidates,
  collectStandaloneResultTaskCandidates,
  resolveSingleActivePlanContinuationTarget,
  resolveSingleResultTaskContinuationTarget,
} from './action-intent-evidence-write-target-helpers.js'
import {
  inputDirectlyReferencesPlan,
  inputDirectlyReferencesPlanId,
  inputDirectlyReferencesTaskId,
} from './action-intent-evidence-write-target-references.js'
import { buildSetPlanUpdateSemanticText } from './authorization-plan-semantics.js'
import {
  hasSemanticAlignment,
  matchesPlanToEnqueueDraft,
  matchesTaskToEnqueueDraft,
} from './authorization-semantics.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type { Task, TaskPlan } from '../../foundation/types/index.js'

const LOW_RISK_AMBIGUOUS_DELTA = 0.15

export type LowRiskWriteEnqueueContinuationResult =
  | {
      ok: true
      mode: 'continue'
      targetId: string
    }
  | {
      ok: false
      reason: 'no_matching_workline'
    }
  | {
      ok: false
      reason: 'ambiguous_workline'
      candidateRefs: string[]
    }

export const resolveLowRiskWriteEnqueueContinuation = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  inputTexts: string[]
  taskById?: Map<string, Task>
  planById?: Map<string, TaskPlan>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
}): LowRiskWriteEnqueueContinuationResult => {
  const candidates = [
    ...collectPlanCandidates(params),
    ...collectStandaloneResultTaskCandidates(params),
  ].sort((left, right) => right.score - left.score)
  const top = candidates[0]
  if (!top) return { ok: false, reason: 'no_matching_workline' }
  const next = candidates[1]
  if (
    next &&
    Math.abs(top.score - next.score) < LOW_RISK_AMBIGUOUS_DELTA &&
    Math.abs(top.draftScore - next.draftScore) < LOW_RISK_AMBIGUOUS_DELTA &&
    Math.abs(top.inputScore - next.inputScore) < LOW_RISK_AMBIGUOUS_DELTA
  ) {
    return {
      ok: false,
      reason: 'ambiguous_workline',
      candidateRefs: [top.ref, next.ref],
    }
  }
  return {
    ok: true,
    mode: 'continue',
    targetId: top.id,
  }
}

export const supportsDirectWriteEnqueueContinuationTarget = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  inputTexts: string[]
  taskById?: Map<string, Task>
  planById?: Map<string, TaskPlan>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
}): boolean => {
  const continuation = resolveLowRiskWriteEnqueueContinuation(params)
  if (continuation.ok) return true
  const plan = resolveSingleActivePlanContinuationTarget(params)
  if (
    plan &&
    inputDirectlyReferencesPlanId(params.inputTexts, plan) &&
    matchesPlanToEnqueueDraft(plan, params.item)
  )
    return true
  const task = resolveSingleResultTaskContinuationTarget(params)
  return (
    task !== undefined &&
    inputDirectlyReferencesTaskId(params.inputTexts, task) &&
    matchesTaskToEnqueueDraft(task, params.item)
  )
}

export const supportsDirectWritePlanUpdateTarget = (params: {
  item: Extract<Parsed, { type: 'set_plan' }>
  inputTexts: string[]
  planById?: Map<string, TaskPlan>
}): boolean => {
  if (params.item.plan_id === null) return false
  const currentPlan = params.planById?.get(params.item.plan_id)
  if (
    !inputDirectlyReferencesPlan(params.inputTexts, currentPlan) ||
    !currentPlan
  )
    return false
  if (
    hasSemanticAlignment(currentPlan.title, params.item.plan.title) ||
    hasSemanticAlignment(
      currentPlan.effect.taskTemplate.title,
      params.item.plan.task.title,
    ) ||
    hasSemanticAlignment(
      currentPlan.effect.taskContract?.goal ?? '',
      params.item.plan.task.goal,
    )
  )
    return true
  return hasSemanticAlignment(
    buildSetPlanUpdateSemanticText(params.item, currentPlan),
    params.inputTexts.join('\n'),
  )
}
