import { matchesWriteEnqueueLane } from './action-intent-evidence-write-lane.js'
import {
  buildEnqueueContinuationCandidateRef,
  inputDirectlyReferencesPlan,
  inputDirectlyReferencesTask,
} from './action-intent-evidence-write-target-references.js'
import { scoreSemanticAlignment } from './authorization-semantic-score.js'
import {
  buildEnqueueDraftSemanticText,
  buildPlanSemanticText,
  buildTaskSemanticText,
} from './authorization-semantics.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type { Task, TaskPlan } from '../../foundation/types/index.js'

const LOW_RISK_DRAFT_MATCH_THRESHOLD = 0.35

export type EnqueueContinuationCandidate = {
  kind: 'plan' | 'task'
  id: string
  ref: string
  draftScore: number
  inputScore: number
  score: number
}

type EnqueueItem = Extract<Parsed, { type: 'enqueue_task' }>

type EnqueueContinuationParams = {
  item: EnqueueItem
  inputTexts: string[]
  taskById?: Map<string, Task>
  planById?: Map<string, TaskPlan>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
}

export const collectPlanCandidates = (
  params: EnqueueContinuationParams,
): EnqueueContinuationCandidate[] => {
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
    const draftScore = scoreSemanticAlignment(
      buildPlanSemanticText(plan),
      draftText,
    )
    const directReference = inputDirectlyReferencesPlan(params.inputTexts, plan)
    const { lastTaskId } = plan.runtime
    const runtimeAnchor =
      lastTaskId !== undefined && params.resultTaskIds?.has(lastTaskId) === true
    const hasOwnership = directReference || runtimeAnchor
    if (!hasOwnership || draftScore < LOW_RISK_DRAFT_MATCH_THRESHOLD) continue
    const inputScore = inputText
      ? scoreSemanticAlignment(buildPlanSemanticText(plan), inputText)
      : 0
    candidates.push({
      kind: 'plan',
      id: plan.id,
      ref: buildEnqueueContinuationCandidateRef({
        id: plan.id,
        title: plan.title,
      }),
      draftScore,
      inputScore,
      score:
        draftScore +
        inputScore +
        (directReference ? 1.5 : 0) +
        (runtimeAnchor ? 0.9 : 0),
    })
  }
  return candidates
}

export const collectStandaloneResultTaskCandidates = (
  params: EnqueueContinuationParams,
): EnqueueContinuationCandidate[] => {
  const draftText = buildEnqueueDraftSemanticText(params.item)
  const inputText = params.inputTexts.join('\n').trim()
  const anchoredTaskIds = new Set(
    [...(params.planById?.values() ?? [])]
      .map((plan) => plan.runtime.lastTaskId)
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
    const draftScore = scoreSemanticAlignment(
      buildTaskSemanticText(task),
      draftText,
    )
    if (draftScore < LOW_RISK_DRAFT_MATCH_THRESHOLD) continue
    const directReference = inputDirectlyReferencesTask(params.inputTexts, task)
    const inputScore = inputText
      ? scoreSemanticAlignment(buildTaskSemanticText(task), inputText)
      : 0
    candidates.push({
      kind: 'task',
      id: task.id,
      ref: buildEnqueueContinuationCandidateRef({
        id: task.id,
        title: task.title,
      }),
      draftScore,
      inputScore,
      score: draftScore + inputScore + (directReference ? 1.5 : 0) + 0.9,
    })
  }
  return candidates
}

export const resolveSingleActivePlanContinuationTarget = (
  params: Pick<
    EnqueueContinuationParams,
    'item' | 'planById' | 'resultTaskIds' | 'defaultFocusId'
  >,
): TaskPlan | undefined => {
  if (!params.planById) return undefined
  const candidates = [...params.planById.values()].filter(
    (plan) =>
      plan.status === 'active' &&
      matchesWriteEnqueueLane({
        item: params.item,
        cwd: plan.effect.taskTemplate.cwd,
        resourceMode: plan.effect.taskTemplate.resourceMode,
        useWorktree: plan.effect.taskTemplate.useWorktree,
      }),
  )
  const anchoredCandidates = candidates.filter(
    (plan) =>
      plan.runtime.lastTaskId !== undefined &&
      params.resultTaskIds?.has(plan.runtime.lastTaskId) === true,
  )
  if (anchoredCandidates.length === 1) return anchoredCandidates[0]
  if (anchoredCandidates.length > 1) return undefined
  const focusId = params.defaultFocusId?.trim()
  if (!focusId) return undefined
  const focusCandidates = candidates.filter(
    (plan) => plan.focusId.trim() === focusId,
  )
  return focusCandidates.length === 1 ? focusCandidates[0] : undefined
}

export const resolveSingleResultTaskContinuationTarget = (
  params: Pick<
    EnqueueContinuationParams,
    'item' | 'taskById' | 'resultTaskIds' | 'defaultFocusId'
  >,
): Task | undefined => {
  if (!params.taskById || !params.resultTaskIds?.size) return undefined
  const candidates = [...params.resultTaskIds]
    .map((taskId) => params.taskById?.get(taskId))
    .filter((task): task is Task => {
      if (!task) return false
      return matchesWriteEnqueueLane({
        item: params.item,
        cwd: task.cwd,
        resourceMode: task.resourceMode,
        useWorktree: Boolean(task.git),
      })
    })
  return candidates.length === 1 ? candidates[0] : undefined
}
