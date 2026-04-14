import { isSupportedByInputs } from './action-intent-evidence-match.js'
import { matchesWriteEnqueueLane } from './action-intent-evidence-write-lane.js'
import { buildSetPlanUpdateSemanticText } from './authorization-plan-semantics.js'
import {
  buildEnqueueDraftSemanticText,
  buildPlanSemanticText,
  buildTaskSemanticText,
  hasSemanticAlignment,
  scoreSemanticAlignment,
} from './authorization-semantics.js'

import type { Task, TaskPlan } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const LOW_RISK_DRAFT_MATCH_THRESHOLD = 0.35
const LOW_RISK_AMBIGUOUS_DELTA = 0.15

type EnqueueContinuationCandidate = {
  kind: 'plan' | 'task'
  id: string
  ref: string
  draftScore: number
  inputScore: number
  score: number
}

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

const buildCandidateRef = (value: { id: string; title: string }): string =>
  value.title.trim() ? `${value.id} / ${value.title.trim()}` : value.id

const collectPlanCandidates = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  inputTexts: string[]
  planById?: Map<string, TaskPlan>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
}): EnqueueContinuationCandidate[] => {
  const draftText = buildEnqueueDraftSemanticText(params.item)
  const inputText = params.inputTexts.join('\n').trim()
  const candidates: EnqueueContinuationCandidate[] = []
  for (const plan of params.planById?.values() ?? []) {
    if (plan.status !== 'active') continue
    if (
      !matchesWriteEnqueueLane({
        item: params.item,
        cwd: plan.effect.taskTemplate.cwd,
        resourceMode: plan.effect.taskTemplate.resourceMode,
        useWorktree: plan.effect.taskTemplate.useWorktree,
      })
    )
      continue
    const draftScore = scoreSemanticAlignment(buildPlanSemanticText(plan), draftText)
    const directReference = isSupportedByInputs({
      candidates: [plan.id, plan.title],
      inputs: params.inputTexts,
    })
    if (!directReference && draftScore < LOW_RISK_DRAFT_MATCH_THRESHOLD) continue
    const runtimeAnchor =
      (plan.runtime?.lastTaskId !== undefined &&
        params.resultTaskIds?.has(plan.runtime.lastTaskId)) === true
    const focusOwnership = plan.focusId.trim() === params.defaultFocusId?.trim()
    const inputScore = inputText
      ? scoreSemanticAlignment(buildPlanSemanticText(plan), inputText)
      : 0
    candidates.push({
      kind: 'plan',
      id: plan.id,
      ref: buildCandidateRef({ id: plan.id, title: plan.title }),
      draftScore,
      inputScore,
      score:
        draftScore +
        inputScore +
        (directReference ? 1.5 : 0) +
        (runtimeAnchor ? 0.9 : 0) +
        (focusOwnership ? 0.2 : 0),
    })
  }
  return candidates
}

const collectStandaloneResultTaskCandidates = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  inputTexts: string[]
  taskById?: Map<string, Task>
  planById?: Map<string, TaskPlan>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
}): EnqueueContinuationCandidate[] => {
  const draftText = buildEnqueueDraftSemanticText(params.item)
  const inputText = params.inputTexts.join('\n').trim()
  const anchoredTaskIds = new Set(
    [...(params.planById?.values() ?? [])]
      .map((plan) => plan.runtime?.lastTaskId)
      .filter((taskId): taskId is string => Boolean(taskId)),
  )
  const candidates: EnqueueContinuationCandidate[] = []
  for (const taskId of params.resultTaskIds ?? []) {
    if (anchoredTaskIds.has(taskId)) continue
    const task = params.taskById?.get(taskId)
    if (!task) continue
    if (
      !matchesWriteEnqueueLane({
        item: params.item,
        cwd: task.cwd,
        resourceMode: task.resourceMode,
        useWorktree: Boolean(task.git),
      })
    )
      continue
    const draftScore = scoreSemanticAlignment(buildTaskSemanticText(task), draftText)
    const directReference = isSupportedByInputs({
      candidates: [task.id, task.title],
      inputs: params.inputTexts,
    })
    if (!directReference && draftScore < LOW_RISK_DRAFT_MATCH_THRESHOLD) continue
    const focusOwnership = task.focusId.trim() === params.defaultFocusId?.trim()
    const inputScore = inputText
      ? scoreSemanticAlignment(buildTaskSemanticText(task), inputText)
      : 0
    candidates.push({
      kind: 'task',
      id: task.id,
      ref: buildCandidateRef({ id: task.id, title: task.title }),
      draftScore,
      inputScore,
      score:
        draftScore +
        inputScore +
        (directReference ? 1.5 : 0) +
        0.9 +
        (focusOwnership ? 0.2 : 0),
    })
  }
  return candidates
}

const resolveSingleActivePlanContinuationTarget = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  planById?: Map<string, TaskPlan>
  defaultFocusId?: string
}): TaskPlan | undefined => {
  const focusId = params.defaultFocusId?.trim()
  if (!focusId || !params.planById) return undefined
  const candidates = [...params.planById.values()].filter(
    (plan) =>
      plan.status === 'active' &&
      plan.focusId.trim() === focusId &&
      matchesWriteEnqueueLane({
        item: params.item,
        cwd: plan.effect.taskTemplate.cwd,
        resourceMode: plan.effect.taskTemplate.resourceMode,
        useWorktree: plan.effect.taskTemplate.useWorktree,
      }),
  )
  return candidates.length === 1 ? candidates[0] : undefined
}

const resolveSingleResultTaskContinuationTarget = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  taskById?: Map<string, Task>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
}): Task | undefined => {
  const focusId = params.defaultFocusId?.trim()
  if (!focusId || !params.taskById || !params.resultTaskIds?.size)
    return undefined
  const candidates = [...params.resultTaskIds]
    .map((taskId) => params.taskById?.get(taskId))
    .filter((task): task is Task => {
      if (!task) return false
      return (
        task.focusId.trim() === focusId &&
        matchesWriteEnqueueLane({
          item: params.item,
          cwd: task.cwd,
          resourceMode: task.resourceMode,
          useWorktree: Boolean(task.git),
        })
      )
    })
  return candidates.length === 1 ? candidates[0] : undefined
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

const inputDirectlyReferencesPlan = (
  inputTexts: string[],
  plan: TaskPlan | undefined,
): boolean => {
  if (!plan) return false
  return isSupportedByInputs({
    candidates: [plan.id, plan.title],
    inputs: inputTexts,
  })
}

const inputDirectlyReferencesTask = (
  inputTexts: string[],
  task: Task | undefined,
): boolean => {
  if (!task) return false
  return isSupportedByInputs({
    candidates: [task.id, task.title],
    inputs: inputTexts,
  })
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
  if (inputDirectlyReferencesPlan(params.inputTexts, plan)) return true
  const task = resolveSingleResultTaskContinuationTarget(params)
  return inputDirectlyReferencesTask(params.inputTexts, task)
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
