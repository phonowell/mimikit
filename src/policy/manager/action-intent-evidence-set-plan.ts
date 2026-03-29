import { scoreTextOverlap } from '../../foundation/shared/text-search.js'
import { normalizeInlineWhitespace } from '../../foundation/shared/text.js'

import type { TaskPlan } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const SET_PLAN_UPDATE_OVERLAP_THRESHOLD = 0.15

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
