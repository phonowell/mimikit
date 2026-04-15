import { compactTaskContractForMatching } from '../../foundation/shared/task-contract-compact.js'

import {
  describePlanMaxRuns,
  describePlanPriority,
  describePlanTrigger,
} from './authorization-plan-semantics.js'
import {
  hasSemanticAlignment as hasSemanticAlignmentWithThreshold,
  normalizeSemanticText,
  scoreSemanticAlignment as scoreSemanticAlignmentBase,
} from './authorization-semantic-score.js'

import type {
  Task,
  TaskContract,
  TaskPlan,
  TaskResult,
} from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const SEMANTIC_MATCH_THRESHOLD = 0.35

type EnqueueTaskItem = Extract<Parsed, { type: 'enqueue_task' }>
type SetPlanItem = Extract<Parsed, { type: 'set_plan' }>

const buildSemanticText = (values: Array<string | undefined>): string =>
  values.map(normalizeSemanticText).filter(Boolean).join('\n')

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
        (value): value is string => Boolean(normalizeSemanticText(value)),
      )
    : []

export const scoreSemanticAlignment = (left: string, right: string): number =>
  scoreSemanticAlignmentBase(left, right)

export const hasSemanticAlignment = (
  left: string,
  right: string,
  threshold = SEMANTIC_MATCH_THRESHOLD,
): boolean => hasSemanticAlignmentWithThreshold(left, right, threshold)

export const matchesPlanToEnqueueDraft = (
  plan: TaskPlan,
  item: EnqueueTaskItem,
): boolean =>
  scoreSemanticAlignment(
    buildPlanSemanticText(plan),
    buildEnqueueDraftSemanticText(item),
  ) >= SEMANTIC_MATCH_THRESHOLD

export const matchesTaskToEnqueueDraft = (
  task: Task,
  item: EnqueueTaskItem,
): boolean =>
  scoreSemanticAlignment(
    buildTaskSemanticText(task),
    buildEnqueueDraftSemanticText(item),
  ) >= SEMANTIC_MATCH_THRESHOLD

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
  const taskTitle = normalizeSemanticText(task.title)
  if (!taskTitle) return false
  return (
    normalizeSemanticText(plan.title) === taskTitle ||
    normalizeSemanticText(plan.effect.taskTemplate.title) === taskTitle
  )
}

export const matchesPlanToResult = (
  plan: TaskPlan,
  result: Pick<TaskResult, 'taskId' | 'title' | 'handoff'>,
): boolean => {
  const resultTitle = normalizeSemanticText(result.title)
  if (resultTitle) {
    return (
      normalizeSemanticText(plan.title) === resultTitle ||
      normalizeSemanticText(plan.effect.taskTemplate.title) === resultTitle
    )
  }
  const resultSummary = buildResultSemanticText(result)
  return hasSemanticAlignment(
    plan.effect.taskTemplate.title,
    resultSummary,
    SEMANTIC_MATCH_THRESHOLD,
  )
}
