import { compactTaskContractForMatching } from '../../foundation/shared/task-contract-compact.js'
import {
  scoreTextOverlap,
  tokenizeSearchText,
} from '../../foundation/shared/text-search.js'
import { normalizeInlineWhitespace } from '../../foundation/shared/text.js'

import {
  describePlanMaxRuns,
  describePlanPriority,
  describePlanTrigger,
} from './authorization-plan-semantics.js'

import type {
  Task,
  TaskContract,
  TaskPlan,
  TaskResult,
} from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const SEMANTIC_MATCH_THRESHOLD = 0.35
const STRONG_TOKEN_MIN_LENGTH = 3
const STRONG_TOKEN_MATCH_COUNT = 2

type EnqueueTaskItem = Extract<Parsed, { type: 'enqueue_task' }>
type SetPlanItem = Extract<Parsed, { type: 'set_plan' }>

const normalizeText = (value: string | undefined): string =>
  normalizeInlineWhitespace(value ?? '')

const buildSemanticText = (values: Array<string | undefined>): string =>
  values.map(normalizeText).filter(Boolean).join('\n')

const buildContractText = (contract: TaskContract | undefined): string => {
  const compact = compactTaskContractForMatching(contract)
  if (!compact) return ''
  return buildSemanticText([
    compact.goal,
    compact.scope,
    ...compact.acceptance,
    compact.outOfScope,
  ])
}

const collectStrongTokens = (value: string): string[] =>
  tokenizeSearchText(value).filter(
    (token) =>
      !token.startsWith('cjk:') && token.length >= STRONG_TOKEN_MIN_LENGTH,
  )

export const scoreSemanticAlignment = (left: string, right: string): number => {
  const normalizedLeft = normalizeText(left)
  const normalizedRight = normalizeText(right)
  if (!normalizedLeft || !normalizedRight) return 0
  if (normalizedLeft === normalizedRight) return 1
  const overlap = Math.max(
    scoreTextOverlap(normalizedLeft, normalizedRight),
    scoreTextOverlap(normalizedRight, normalizedLeft),
  )
  const leftTokens = collectStrongTokens(normalizedLeft)
  const rightTokens = collectStrongTokens(normalizedRight)
  if (leftTokens.length === 0 || rightTokens.length === 0) return overlap
  const rightTokenSet = new Set(rightTokens)
  let shared = 0
  for (const token of leftTokens) {
    if (!rightTokenSet.has(token)) continue
    shared += 1
  }
  const sharedRatio = shared / Math.min(leftTokens.length, rightTokens.length)
  return Math.max(overlap, sharedRatio)
}

export const hasSemanticAlignment = (
  left: string,
  right: string,
  threshold = SEMANTIC_MATCH_THRESHOLD,
): boolean => {
  const score = scoreSemanticAlignment(left, right)
  if (score >= threshold) return true
  const normalizedLeft = normalizeText(left)
  const normalizedRight = normalizeText(right)
  if (!normalizedLeft || !normalizedRight) return false
  const leftTokens = collectStrongTokens(normalizedLeft)
  const rightTokens = new Set(collectStrongTokens(normalizedRight))
  let shared = 0
  for (const token of leftTokens) {
    if (!rightTokens.has(token)) continue
    shared += 1
    if (shared >= STRONG_TOKEN_MATCH_COUNT) return true
  }
  return false
}

export const buildTaskSemanticText = (
  task: Pick<Task, 'title' | 'contract'>,
): string => buildSemanticText([task.title, buildContractText(task.contract)])

export const buildPlanSemanticText = (
  plan: Pick<TaskPlan, 'title' | 'priority' | 'maxRuns' | 'trigger' | 'effect'>,
): string =>
  buildSemanticText([
    plan.title,
    plan.effect.taskTemplate.title,
    buildContractText(plan.effect.taskContract),
    describePlanTrigger(plan.trigger),
    describePlanPriority(plan.priority),
    describePlanMaxRuns(plan.maxRuns),
  ])

export const buildResultSemanticText = (
  result: Pick<TaskResult, 'taskId' | 'title' | 'handoff'>,
): string =>
  buildSemanticText([
    result.title,
    result.handoff?.summary,
    ...(result.handoff?.nextSteps ?? []),
  ])

export const buildEnqueueDraftSemanticText = (item: EnqueueTaskItem): string =>
  buildSemanticText([
    item.task.title,
    item.task.goal,
    ...item.task.in_scope,
    ...item.task.done_when,
    ...item.task.out_of_scope,
  ])

export const buildSetPlanDraftSemanticText = (item: SetPlanItem): string =>
  buildSemanticText([
    item.plan.title,
    item.plan.task.title,
    item.plan.task.goal,
    ...item.plan.task.in_scope,
    ...item.plan.task.done_when,
    ...item.plan.task.out_of_scope,
    describePlanTrigger(item.plan.trigger),
    describePlanPriority(item.plan.priority),
    describePlanMaxRuns(item.plan.max_runs),
  ])

export const collectTaskIntentCandidates = (
  task: Task | undefined,
): string[] =>
  task
    ? [task.id, task.title, task.contract?.goal, task.contract?.scope].filter(
        (value): value is string => Boolean(normalizeText(value)),
      )
    : []

export const matchesPlanToEnqueueDraft = (
  plan: TaskPlan,
  item: EnqueueTaskItem,
): boolean =>
  scoreSemanticAlignment(buildPlanSemanticText(plan), buildEnqueueDraftSemanticText(item)) >=
  SEMANTIC_MATCH_THRESHOLD

export const matchesTaskToEnqueueDraft = (
  task: Task,
  item: EnqueueTaskItem,
): boolean =>
  scoreSemanticAlignment(buildTaskSemanticText(task), buildEnqueueDraftSemanticText(item)) >=
  SEMANTIC_MATCH_THRESHOLD

export const matchesPlanToSetPlanDraft = (
  plan: TaskPlan,
  item: SetPlanItem,
): boolean =>
  hasSemanticAlignment(
    buildPlanSemanticText(plan),
    buildSetPlanDraftSemanticText(item),
  )

export const matchesTaskToSetPlanDraft = (
  task: Task,
  item: SetPlanItem,
): boolean =>
  hasSemanticAlignment(
    buildTaskSemanticText(task),
    buildSetPlanDraftSemanticText(item),
  )

export const matchesPlanToTask = (plan: TaskPlan, task: Task): boolean =>
  hasSemanticAlignment(buildPlanSemanticText(plan), buildTaskSemanticText(task))

export const matchesPlanToTaskTitle = (
  plan: TaskPlan,
  task: Pick<Task, 'title'>,
): boolean => {
  const taskTitle = normalizeText(task.title)
  if (!taskTitle) return false
  return (
    normalizeText(plan.title) === taskTitle ||
    normalizeText(plan.effect.taskTemplate.title) === taskTitle
  )
}

export const matchesPlanToResult = (
  plan: TaskPlan,
  result: Pick<TaskResult, 'taskId' | 'title' | 'handoff'>,
): boolean => {
  const resultTitle = normalizeText(result.title)
  if (resultTitle) {
    return (
      normalizeText(plan.title) === resultTitle ||
      normalizeText(plan.effect.taskTemplate.title) === resultTitle
    )
  }
  const resultSummary = buildResultSemanticText(result)
  return hasSemanticAlignment(plan.effect.taskTemplate.title, resultSummary)
}
