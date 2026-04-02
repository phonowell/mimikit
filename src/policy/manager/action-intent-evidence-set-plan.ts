import { scoreTextOverlap } from '../../foundation/shared/text-search.js'
import { normalizeInlineWhitespace } from '../../foundation/shared/text.js'

import type { TaskPlan } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const SET_PLAN_UPDATE_OVERLAP_THRESHOLD = 0.2

type SetPlanItem = Extract<Parsed, { type: 'set_plan' }>

const resolvePlanTaskTitle = (
  plan: TaskPlan | undefined,
): string | undefined => {
  if (!plan) return undefined
  const title = plan.effect.taskTemplate.title.trim()
  return title || undefined
}

const resolvePlanGoal = (plan: TaskPlan | undefined): string | undefined => {
  if (!plan) return undefined
  const goal = plan.effect.taskContract?.goal
  const normalized = goal?.trim()
  return normalized ?? undefined
}

const resolvePlanScope = (plan: TaskPlan | undefined): string | undefined => {
  if (!plan) return undefined
  const scope = plan.effect.taskContract?.scope
  const normalized = scope?.trim()
  return normalized ?? undefined
}

const resolvePlanAcceptance = (
  plan: TaskPlan | undefined,
): string[] | undefined => {
  if (!plan) return undefined
  const acceptance = plan.effect.taskContract?.acceptance
  if (!acceptance || acceptance.length === 0) return undefined
  return acceptance.map((item) => item.trim()).filter(Boolean)
}

const resolvePlanOutOfScope = (
  plan: TaskPlan | undefined,
): string | undefined => {
  if (!plan) return undefined
  const outOfScope = plan.effect.taskContract?.outOfScope
  const normalized = outOfScope?.trim()
  return normalized ?? undefined
}

const resolveRuntimeTriggerText = (
  trigger: TaskPlan['trigger'] | undefined,
): string | undefined => {
  if (!trigger) return undefined
  if (trigger.mode === 'cron') return trigger.cron
  if (trigger.mode === 'scheduled_at') return trigger.scheduledAt
  return trigger.mode
}

const resolveDraftTriggerText = (
  trigger: SetPlanItem['plan']['trigger'],
): string => {
  if (trigger.type === 'cron') return trigger.cron
  if (trigger.type === 'scheduled_at') return trigger.scheduled_at
  return trigger.type
}

export const collectSetPlanCandidates = (item: SetPlanItem): string[] => [
  item.plan.title,
  item.plan.task.title,
  item.plan.task.goal,
  ...item.plan.task.in_scope,
]

export const collectSetPlanChangedCandidates = (
  item: SetPlanItem,
  currentPlan: TaskPlan | undefined,
): string[] => {
  const nextTrigger = resolveDraftTriggerText(item.plan.trigger)
  if (!currentPlan) {
    return [
      item.plan.title,
      item.plan.task.title,
      item.plan.task.goal,
      ...item.plan.task.in_scope,
      ...item.plan.task.done_when,
      ...item.plan.task.out_of_scope,
      nextTrigger,
    ]
  }

  const changed: string[] = []
  if (
    normalizeInlineWhitespace(currentPlan.title) !==
    normalizeInlineWhitespace(item.plan.title)
  )
    changed.push(item.plan.title)

  if (
    normalizeInlineWhitespace(resolvePlanTaskTitle(currentPlan) ?? '') !==
    normalizeInlineWhitespace(item.plan.task.title)
  )
    changed.push(item.plan.task.title)

  if (
    normalizeInlineWhitespace(resolvePlanGoal(currentPlan) ?? '') !==
    normalizeInlineWhitespace(item.plan.task.goal)
  )
    changed.push(item.plan.task.goal)

  const nextScope = item.plan.task.in_scope
    .map((item) => normalizeInlineWhitespace(item))
    .filter(Boolean)
  const currentScope = normalizeInlineWhitespace(
    resolvePlanScope(currentPlan) ?? '',
  )
  if (
    nextScope.length > 0 &&
    nextScope.some((item) => item && item !== currentScope)
  )
    changed.push(...item.plan.task.in_scope)

  const nextAcceptance = item.plan.task.done_when
    .map((item) => normalizeInlineWhitespace(item))
    .filter(Boolean)
  const currentAcceptance = new Set(
    (resolvePlanAcceptance(currentPlan) ?? [])
      .map((item) => normalizeInlineWhitespace(item))
      .filter(Boolean),
  )
  if (
    nextAcceptance.length > 0 &&
    nextAcceptance.some((item) => item && !currentAcceptance.has(item))
  )
    changed.push(...item.plan.task.done_when)

  const nextOutOfScope = item.plan.task.out_of_scope
    .map((item) => normalizeInlineWhitespace(item))
    .filter(Boolean)
  const currentOutOfScope = normalizeInlineWhitespace(
    resolvePlanOutOfScope(currentPlan) ?? '',
  )
  if (
    nextOutOfScope.length > 0 &&
    nextOutOfScope.some((item) => item && item !== currentOutOfScope)
  )
    changed.push(...item.plan.task.out_of_scope)

  if (resolveRuntimeTriggerText(currentPlan.trigger) !== nextTrigger)
    changed.push(nextTrigger)

  return [...new Set(changed.filter((value) => value.trim().length > 0))]
}

export const resolveSetPlanReferenceCandidates = (
  item: SetPlanItem,
  currentPlan: TaskPlan | undefined,
): string[] =>
  [item.plan_id, currentPlan?.title, resolvePlanTaskTitle(currentPlan)].filter(
    (value): value is string => Boolean(value?.trim()),
  )

export const hasLooseSetPlanSupport = (params: {
  candidates: string[]
  inputTexts: string[]
}): boolean => {
  const inputText = params.inputTexts.join('\n')
  if (!inputText) return false
  return params.candidates.some((rawCandidate) => {
    const candidate = normalizeInlineWhitespace(rawCandidate)
    if (!candidate) return false
    return (
      scoreTextOverlap(candidate, inputText) >=
      SET_PLAN_UPDATE_OVERLAP_THRESHOLD
    )
  })
}
