import { clipCompactText } from '../../foundation/shared/text.js'
import { nowIso } from '../../foundation/shared/utils.js'
import { notifyUiSignal } from '../../kernel/orchestrator/signals.js'
import { GLOBAL_FOCUS_ID } from '../../work/focus/constants.js'
import { updateRuntimePlan } from '../../work/orchestrator/plan-state-write.js'
import { resolveTaskResultSummary } from '../../work/shared/task-state.js'

import {
  matchesPlanToResult,
  matchesPlanToTaskTitle,
} from './authorization-semantics.js'

import type {
  Task,
  TaskPlan,
  TaskResult,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const resolveTriggeredPlanMatch = (
  plans: TaskPlan[],
  task: Pick<Task, 'focusId' | 'title'>,
): TaskPlan | undefined => {
  if (plans.length === 1) {
    const [plan] = plans
    if (!plan) return undefined
    if (plan.focusId !== task.focusId && plan.focusId !== GLOBAL_FOCUS_ID)
      return undefined
    return matchesPlanToTaskTitle(plan, task) ? plan : undefined
  }

  const focusMatches = plans.filter(
    (plan) => plan.focusId === task.focusId || plan.focusId === GLOBAL_FOCUS_ID,
  )
  if (focusMatches.length === 1) {
    const [plan] = focusMatches
    if (!plan) return undefined
    return matchesPlanToTaskTitle(plan, task) ? plan : undefined
  }

  const normalizedTitle = task.title.trim()
  if (!normalizedTitle) return undefined
  const titleMatches = focusMatches.filter((plan) =>
    matchesPlanToTaskTitle(plan, task),
  )
  if (titleMatches.length === 1) return titleMatches[0]
  return undefined
}

const resolvePlanStageSummary = (result: TaskResult): string | undefined => {
  const summary = resolveTaskResultSummary({ result, maxChars: 280 }).trim()
  return summary ? clipCompactText(summary, 280) : undefined
}

const resolvePlanStageRisk = (result: TaskResult): string | undefined => {
  const risk = result.handoff?.risks?.find(
    (item) => typeof item === 'string' && item.trim().length > 0,
  )
  if (risk) return clipCompactText(risk.trim(), 280)
  return undefined
}

const resolvePlanStageNeedsDecision = (result: TaskResult): boolean =>
  result.stopReason === 'input_required'

export const linkTriggeredPlanToTask = (params: {
  runtime: ManagerRuntime
  triggeredPlanIds: ReadonlySet<string> | undefined
  task: Pick<Task, 'id' | 'focusId' | 'title'>
  linkedAt?: string
}): boolean => {
  const { runtime, triggeredPlanIds, task } = params
  if (!triggeredPlanIds || triggeredPlanIds.size === 0) return false

  const candidates = runtime.domain.taskPlans.filter((plan) =>
    triggeredPlanIds.has(plan.id),
  )
  const matchedPlan = resolveTriggeredPlanMatch(candidates, task)
  const nextTaskId = task.id.trim()
  if (
    !matchedPlan ||
    !nextTaskId ||
    matchedPlan.runtime.lastTaskId === nextTaskId
  )
    return false

  updateRuntimePlan({
    runtime,
    planId: matchedPlan.id,
    update: (current) => ({
      ...current,
      runtime: {
        ...current.runtime,
        lastTaskId: nextTaskId,
      },
      updatedAt: params.linkedAt ?? nowIso(),
    }),
  })
  notifyUiSignal(runtime, 'plans')
  return true
}

export const applyPlanCompletionState = (
  runtime: ManagerRuntime,
  results: TaskResult[],
): void => {
  if (results.length === 0) return

  const latestByTaskId = new Map<string, TaskResult>()
  for (const result of results) {
    const existing = latestByTaskId.get(result.taskId)
    if (
      !existing ||
      Date.parse(result.completedAt) >= Date.parse(existing.completedAt)
    )
      latestByTaskId.set(result.taskId, result)
  }

  let changed = false
  for (const [taskId, matched] of latestByTaskId) {
    const matchedPlans = runtime.domain.taskPlans.filter(
      (plan) => plan.runtime.lastTaskId?.trim() === taskId,
    )
    if (matchedPlans.length === 0) continue
    const hasSemanticSignal =
      Boolean(matched.title?.trim()) ||
      Boolean(matched.handoff?.summary?.trim()) ||
      Boolean(
        matched.handoff?.nextSteps?.some((step) => step.trim().length > 0),
      )
    const targetPlans = hasSemanticSignal
      ? matchedPlans.filter((plan) => matchesPlanToResult(plan, matched))
      : matchedPlans.length === 1
        ? matchedPlans
        : []
    if (targetPlans.length !== 1) continue
    const [plan] = targetPlans
    if (!plan || plan.updatedAt === matched.completedAt) continue
    const stageSummary = resolvePlanStageSummary(matched)
    const stageRisk = resolvePlanStageRisk(matched)
    updateRuntimePlan({
      runtime,
      planId: plan.id,
      update: (current) => ({
        ...current,
        updatedAt: matched.completedAt,
        runtime: {
          ...current.runtime,
          ...(stageSummary ||
          stageRisk ||
          resolvePlanStageNeedsDecision(matched)
            ? {
                stage: {
                  summary: stageSummary ?? `Task ${matched.taskId} updated.`,
                  ...(stageRisk ? { risk: stageRisk } : {}),
                  needsDecision: resolvePlanStageNeedsDecision(matched),
                  sourceTaskId: matched.taskId,
                  updatedAt: matched.completedAt,
                },
              }
            : {}),
        },
      }),
    })
    changed = true
  }
  if (changed) notifyUiSignal(runtime, 'plans')
}
