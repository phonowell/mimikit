import { resolveDefaultFocusId } from '../../work/focus/index.js'
import { resolveTaskResourceMode } from '../../work/shared/task-resource-mode.js'

import { formatMissingResultFollowupActionHint } from './action-feedback-hints.js'
import { resolveStructuredAnchoredPlan } from './task-result-followup-plan-anchor.js'
import { hasSupportedStopDecision } from './task-result-stop-decision.js'

import type { ManagerTurnDecision } from './manager-turn-schema.js'
import type {
  ManagerActionFeedback,
  ManagerWakeProfile,
  TaskResult,
  UserInput,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
import type { Parsed } from '../actions/model/spec.js'

const CONTINUATION_ACTION_TYPES = new Set([
  'enqueue_task',
  'task_control',
  'set_plan',
  'delete_plan',
])

const hasConcreteFollowupAction = (actions: Parsed[]): boolean =>
  actions.some((item) => CONTINUATION_ACTION_TYPES.has(item.type))

const resolveSingleNextStep = (result: TaskResult): string | undefined => {
  const nextSteps = (result.handoff?.nextSteps ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
  if (nextSteps.length !== 1) return undefined
  return nextSteps[0]
}

const supportsSinglePlanRuntimeContinuation = (params: {
  plan: NonNullable<ManagerRuntime['domain']['taskPlans'][number]> | undefined
  task: NonNullable<ManagerRuntime['domain']['tasks'][number]> | undefined
}): boolean => {
  const { plan, task } = params
  if (!plan || !task) return false
  if (plan.effect.taskTemplate.cwd.trim() !== task.cwd.trim()) return false
  if (
    resolveTaskResourceMode(plan.effect.taskTemplate.resourceMode) !==
    resolveTaskResourceMode(task.resourceMode)
  )
    return false
  if (Boolean(plan.effect.taskTemplate.useWorktree) !== Boolean(task.git))
    return false
  return true
}

export const resolveResultFollowupFeedback = (params: {
  runtime: ManagerRuntime
  inputs?: UserInput[]
  results?: TaskResult[]
  parsed: Parsed[]
  decision?: ManagerTurnDecision
  wakeProfile: ManagerWakeProfile
  resultTaskIds: Set<string>
  currentFeedback: ManagerActionFeedback[]
  priorActionFeedback?: ManagerActionFeedback[]
}): ManagerActionFeedback | undefined => {
  if (params.currentFeedback.length > 0) return undefined
  if (params.wakeProfile !== 'task_result') return undefined
  if ((params.inputs ?? []).length > 0) return undefined
  if (hasConcreteFollowupAction(params.parsed)) return undefined
  if (params.results?.length !== 1) return undefined
  const [result] = params.results
  if (!result || !params.resultTaskIds.has(result.taskId)) return undefined
  if (!result.ok || result.status !== 'succeeded') return undefined
  if (
    result.stopReason &&
    result.stopReason !== 'completed' &&
    result.stopReason !== 'closure_pending'
  )
    return undefined

  const focusId = resolveDefaultFocusId(params.runtime).trim()
  const task = params.runtime.domain.tasks.find(
    (item) =>
      item.id === result.taskId &&
      item.focusId.trim() === focusId &&
      item.cwd.trim().length > 0,
  )
  if (!task) return undefined

  const activePlans = params.runtime.domain.taskPlans.filter(
    (plan) => plan.status === 'active' && plan.focusId.trim() === focusId,
  )
  const structuredAnchoredPlan = resolveStructuredAnchoredPlan({
    activePlans,
    task,
    result,
  })
  if (structuredAnchoredPlan || activePlans.length === 1) {
    const plan = structuredAnchoredPlan ?? activePlans[0]
    if (
      supportsSinglePlanRuntimeContinuation({
        plan,
        task,
      })
    )
      return undefined
  }
  if (activePlans.length > 1) return undefined
  if (!resolveSingleNextStep(result)) return undefined
  if (
    hasSupportedStopDecision({
      decision: params.decision,
      result,
      ...(params.priorActionFeedback
        ? { priorActionFeedback: params.priorActionFeedback }
        : {}),
    })
  )
    return undefined

  return {
    action: 'manager_followup',
    error: 'action_execution_rejected',
    hint: formatMissingResultFollowupActionHint(
      '本轮 result task 的结构化 next step',
    ),
    code: 'missing_result_followup_action',
  }
}
