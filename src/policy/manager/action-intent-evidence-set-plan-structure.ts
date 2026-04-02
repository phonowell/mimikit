import { normalizeInlineWhitespace } from '../../foundation/shared/text.js'
import { resolveTaskResourceMode } from '../../work/shared/task-resource-mode.js'

import type { TaskPlan } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

type SetPlanItem = Extract<Parsed, { type: 'set_plan' }>

const normalizeOptionalText = (value: string | undefined): string =>
  normalizeInlineWhitespace(value ?? '')

const normalizeTextList = (values: readonly string[]): string[] =>
  values.map((item) => normalizeInlineWhitespace(item)).filter(Boolean)

const equalNormalizedLists = (
  left: readonly string[],
  right: readonly string[],
): boolean => {
  if (left.length !== right.length) return false
  return left.every((item, index) => item === right[index])
}

const resolveCurrentScope = (plan: TaskPlan): string =>
  normalizeOptionalText(plan.effect.taskContract?.scope)

const resolveCurrentAcceptance = (plan: TaskPlan): string[] =>
  normalizeTextList(plan.effect.taskContract?.acceptance ?? [])

const resolveCurrentOutOfScope = (plan: TaskPlan): string =>
  normalizeOptionalText(plan.effect.taskContract?.outOfScope)

const resolveCurrentTrigger = (plan: TaskPlan): string => {
  const { trigger } = plan
  if (trigger.mode === 'cron') return normalizeOptionalText(trigger.cron)
  if (trigger.mode === 'scheduled_at')
    return normalizeOptionalText(trigger.scheduledAt)
  return trigger.mode
}

const resolveDraftTrigger = (item: SetPlanItem): string => {
  const { trigger } = item.plan
  if (trigger.type === 'cron') return normalizeOptionalText(trigger.cron)
  if (trigger.type === 'scheduled_at')
    return normalizeOptionalText(trigger.scheduled_at)
  return trigger.type
}

const hasSameExecutionLane = (
  item: SetPlanItem,
  currentPlan: TaskPlan,
): boolean =>
  normalizeOptionalText(currentPlan.effect.taskTemplate.cwd) ===
    normalizeOptionalText(item.plan.task.cwd) &&
  resolveTaskResourceMode(currentPlan.effect.taskTemplate.resourceMode) ===
    item.plan.task.mode &&
  Boolean(currentPlan.effect.taskTemplate.useWorktree) ===
    (item.plan.task.use_worktree === true)

export const hasStructuredSetPlanReferenceUpdate = (params: {
  item: SetPlanItem
  currentPlan: TaskPlan | undefined
}): boolean => {
  const { currentPlan, item } = params
  if (!currentPlan) return false
  if (!hasSameExecutionLane(item, currentPlan)) return false

  if (
    normalizeOptionalText(currentPlan.title) !==
    normalizeOptionalText(item.plan.title)
  )
    return true
  if (
    normalizeOptionalText(currentPlan.effect.taskTemplate.title) !==
    normalizeOptionalText(item.plan.task.title)
  )
    return true
  if (
    normalizeOptionalText(currentPlan.effect.taskContract?.goal) !==
    normalizeOptionalText(item.plan.task.goal)
  )
    return true
  if (
    resolveCurrentScope(currentPlan) !==
    normalizeOptionalText(item.plan.task.in_scope.join('；'))
  )
    return true
  if (
    !equalNormalizedLists(
      resolveCurrentAcceptance(currentPlan),
      normalizeTextList(item.plan.task.done_when),
    )
  )
    return true
  if (
    resolveCurrentOutOfScope(currentPlan) !==
    normalizeOptionalText(item.plan.task.out_of_scope.join('；'))
  )
    return true
  if (resolveCurrentTrigger(currentPlan) !== resolveDraftTrigger(item))
    return true
  if (currentPlan.priority !== item.plan.priority) return true
  return (currentPlan.maxRuns ?? null) !== item.plan.max_runs
}
