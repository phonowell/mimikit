import { normalizeInlineWhitespace } from '../../foundation/shared/text.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type { TaskPlan } from '../../foundation/types/index.js'

type SetPlanItem = Extract<Parsed, { type: 'set_plan' }>

const normalizeText = (value: string | undefined): string =>
  normalizeInlineWhitespace(value ?? '')

const buildSemanticText = (values: Array<string | undefined>): string =>
  values.map(normalizeText).filter(Boolean).join('\n')

export const describePlanPriority = (
  priority: TaskPlan['priority'],
): string => {
  if (priority === 'high') return '高优先级 (high)'
  if (priority === 'low') return '低优先级 (low)'
  return '普通优先级 (normal)'
}

export const describePlanTrigger = (
  trigger: TaskPlan['trigger'] | SetPlanItem['plan']['trigger'],
): string => {
  if ('mode' in trigger) {
    if (trigger.mode === 'cron') return `定时触发 ${trigger.cron}`
    if (trigger.mode === 'scheduled_at') return `在 ${trigger.scheduledAt} 触发`
    return '等有空闲 worker 再继续'
  }
  if (trigger.type === 'cron') return `定时触发 ${trigger.cron}`
  if (trigger.type === 'scheduled_at') return `在 ${trigger.scheduled_at} 触发`
  return '等有空闲 worker 再继续'
}

export const describePlanMaxRuns = (
  maxRuns: number | null | undefined,
): string =>
  maxRuns === null || maxRuns === undefined
    ? '运行次数不限'
    : maxRuns === 1
      ? '只保留一轮；最多运行 1 次'
      : `最多运行 ${maxRuns} 次`

export const buildSetPlanUpdateSemanticText = (
  item: SetPlanItem,
  currentPlan: TaskPlan | undefined,
): string => {
  if (!currentPlan) return ''
  const changed: string[] = []
  if (normalizeText(currentPlan.title) !== normalizeText(item.plan.title))
    changed.push(`计划标题 ${item.plan.title}`)
  if (
    normalizeText(currentPlan.effect.taskTemplate.title) !==
    normalizeText(item.plan.task.title)
  )
    changed.push(`任务标题 ${item.plan.task.title}`)
  if (
    normalizeText(currentPlan.effect.taskContract?.goal) !==
    normalizeText(item.plan.task.goal)
  )
    changed.push(item.plan.task.goal)
  const nextScope = item.plan.task.in_scope.join('；')
  if (
    normalizeText(currentPlan.effect.taskContract?.scope) !==
    normalizeText(nextScope)
  )
    changed.push(...item.plan.task.in_scope.map((value) => `范围 ${value}`))
  const currentAcceptance = (currentPlan.effect.taskContract?.acceptance ?? [])
    .map(normalizeText)
    .filter(Boolean)
  const nextAcceptance = item.plan.task.done_when
    .map(normalizeText)
    .filter(Boolean)
  if (
    currentAcceptance.length !== nextAcceptance.length ||
    currentAcceptance.some((value, index) => value !== nextAcceptance[index])
  )
    changed.push(...item.plan.task.done_when.map((value) => `验收 ${value}`))
  const nextOutOfScope = item.plan.task.out_of_scope.join('；')
  if (
    normalizeText(currentPlan.effect.taskContract?.outOfScope) !==
    normalizeText(nextOutOfScope)
  ) {
    changed.push(
      ...item.plan.task.out_of_scope.map((value) => `不包含 ${value}`),
    )
  }
  if (
    normalizeText(describePlanTrigger(currentPlan.trigger)) !==
    normalizeText(describePlanTrigger(item.plan.trigger))
  )
    changed.push(describePlanTrigger(item.plan.trigger))
  if (currentPlan.priority !== item.plan.priority)
    changed.push(describePlanPriority(item.plan.priority))
  if ((currentPlan.maxRuns ?? null) !== item.plan.max_runs)
    changed.push(describePlanMaxRuns(item.plan.max_runs))
  return buildSemanticText(changed)
}
