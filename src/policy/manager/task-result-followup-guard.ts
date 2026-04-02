import { compactTaskContractForMatching } from '../../foundation/shared/task-contract-compact.js'
import { scoreTextOverlap } from '../../foundation/shared/text-search.js'
import { resolveDefaultFocusId } from '../../work/focus/index.js'
import { resolveTaskResourceMode } from '../../work/shared/task-resource-mode.js'

import { formatMissingResultFollowupActionHint } from './action-feedback-hints.js'
import { hasSupportedStopDecision } from './task-result-stop-decision.js'

import type { ManagerTurnDecision } from './manager-turn-schema.js'
import type {
  ManagerActionFeedback,
  ManagerWakeProfile,
  Task,
  TaskPlan,
  TaskResult,
  UserInput,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
import type { Parsed } from '../actions/model/spec.js'

const RESULT_FOLLOWUP_OVERLAP_THRESHOLD = 0.35
const CONTINUATION_ACTION_TYPES = new Set([
  'enqueue_task',
  'task_control',
  'set_plan',
  'delete_plan',
])

const buildContinuationText = (params: {
  title: string
  goal: string
  scope: string
  acceptance: string[]
  outOfScope?: string | undefined
}): string =>
  [
    params.title,
    params.goal,
    params.scope,
    ...params.acceptance,
    ...(params.outOfScope ? [params.outOfScope] : []),
  ]
    .map((item) => item.trim())
    .filter(Boolean)
    .join('\n')

const buildTaskContinuationText = (task: Task): string => {
  const contract = compactTaskContractForMatching(task.contract)
  return buildContinuationText({
    title: task.title,
    goal: contract?.goal ?? task.title,
    scope: contract?.scope ?? task.title,
    acceptance: contract?.acceptance ?? [],
    ...(contract?.outOfScope ? { outOfScope: contract.outOfScope } : {}),
  })
}

const buildPlanContinuationText = (plan: TaskPlan): string => {
  const contract = compactTaskContractForMatching(plan.effect.taskContract)
  return buildContinuationText({
    title: plan.effect.taskTemplate.title,
    goal: contract?.goal ?? plan.title,
    scope: contract?.scope ?? plan.title,
    acceptance: contract?.acceptance ?? [],
    ...(contract?.outOfScope ? { outOfScope: contract.outOfScope } : {}),
  })
}

const hasContinuationMatch = (left: string, right: string): boolean =>
  Math.max(scoreTextOverlap(left, right), scoreTextOverlap(right, left)) >=
  RESULT_FOLLOWUP_OVERLAP_THRESHOLD

const hasConcreteFollowupAction = (actions: Parsed[]): boolean =>
  actions.some((item) => CONTINUATION_ACTION_TYPES.has(item.type))

const resolveSingleNextStep = (result: TaskResult): string | undefined => {
  const nextSteps = (result.handoff?.nextSteps ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
  if (nextSteps.length !== 1) return undefined
  return nextSteps[0]
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
  if (activePlans.length === 1) {
    const [plan] = activePlans
    if (!plan) return undefined
    if (plan.effect.taskTemplate.cwd.trim() !== task.cwd.trim())
      return undefined
    if (
      resolveTaskResourceMode(plan.effect.taskTemplate.resourceMode) !==
      resolveTaskResourceMode(task.resourceMode)
    )
      return undefined
    if (
      !hasContinuationMatch(
        buildTaskContinuationText(task),
        buildPlanContinuationText(plan),
      )
    )
      return undefined
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
        '当前 active plan + 本轮 result task',
      ),
      code: 'missing_result_followup_action',
    }
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
