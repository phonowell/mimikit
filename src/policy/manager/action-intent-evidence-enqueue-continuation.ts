import { compactTaskContractForMatching } from '../../foundation/shared/task-contract-compact.js'
import { scoreTextOverlap } from '../../foundation/shared/text-search.js'
import { isActiveTask } from '../../work/orchestrator/task-state.js'
import { hasTaskClosedGitLifecycle } from '../../work/shared/task-git-closure-truth.js'
import { resolveTaskResourceMode } from '../../work/shared/task-resource-mode.js'

import { buildTaskContractFromDraft } from './task-contract.js'

import type { Task, TaskPlan } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const PAUSED_TASK_CONTINUATION_OVERLAP_THRESHOLD = 0.35

const buildEnqueueContractText = (params: {
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

const buildTaskContinuationText = (task: Task): string =>
  (() => {
    const contract = compactTaskContractForMatching(task.contract)
    return buildEnqueueContractText({
      title: task.title,
      goal: contract?.goal ?? task.title,
      scope: contract?.scope ?? task.title,
      acceptance: contract?.acceptance ?? [],
      ...(contract?.outOfScope ? { outOfScope: contract.outOfScope } : {}),
    })
  })()

const hasContinuationMatch = (
  left: string,
  right: string,
  threshold: number,
): boolean =>
  Math.max(scoreTextOverlap(left, right), scoreTextOverlap(right, left)) >=
  threshold

const buildDraftContinuationText = (
  item: Extract<Parsed, { type: 'enqueue_task' }>,
): string | undefined => {
  const contract = buildTaskContractFromDraft(item.task)
  if (!contract) return undefined
  return buildEnqueueContractText({
    title: item.task.title,
    goal: contract.goal,
    scope: contract.scope,
    acceptance: contract.acceptance,
    ...(contract.outOfScope ? { outOfScope: contract.outOfScope } : {}),
  })
}

const matchesDraftTaskMode = (params: {
  task: Task
  item: Extract<Parsed, { type: 'enqueue_task' }>
}): boolean =>
  resolveTaskResourceMode(params.task.resourceMode) === params.item.task.mode &&
  Boolean(params.task.git) === (params.item.task.use_worktree === true)

export const resolvePausedTaskContinuationMatch = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  taskById?: Map<string, Task>
  defaultFocusId?: string
}): Task | undefined => {
  const focusId = params.defaultFocusId?.trim()
  if (!focusId || !params.taskById) return undefined
  const taskText = buildDraftContinuationText(params.item)
  if (!taskText) return undefined
  const pausedMatches = [...params.taskById.values()].filter((task) => {
    if (task.status !== 'paused') return false
    if (hasTaskClosedGitLifecycle(task)) return false
    if (task.focusId.trim() !== focusId) return false
    if (task.cwd.trim() !== params.item.task.cwd.trim()) return false
    if (!matchesDraftTaskMode({ task, item: params.item })) return false
    return hasContinuationMatch(
      buildTaskContinuationText(task),
      taskText,
      PAUSED_TASK_CONTINUATION_OVERLAP_THRESHOLD,
    )
  })
  return pausedMatches.length === 1 ? pausedMatches[0] : undefined
}

const supportsPlanContinuation = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  planById?: Map<string, TaskPlan>
  defaultFocusId?: string
}): boolean => {
  const focusId = params.defaultFocusId?.trim()
  if (!focusId || !params.planById) return false
  const activePlans = [...params.planById.values()].filter(
    (plan) => plan.status === 'active' && plan.focusId.trim() === focusId,
  )
  if (activePlans.length !== 1) return false
  const [plan] = activePlans
  if (!plan) return false
  if (plan.effect.taskTemplate.cwd.trim() !== params.item.task.cwd.trim())
    return false

  if (
    resolveTaskResourceMode(plan.effect.taskTemplate.resourceMode) !==
    params.item.task.mode
  )
    return false

  return (
    Boolean(plan.effect.taskTemplate.useWorktree) ===
    (params.item.task.use_worktree === true)
  )
}

const supportsResultTaskContinuation = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  taskById?: Map<string, Task>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
}): boolean => {
  const focusId = params.defaultFocusId?.trim()
  if (!focusId || !params.taskById || !params.resultTaskIds?.size) return false
  const { taskById } = params
  const { resultTaskIds } = params
  const resultTasks = [...resultTaskIds]
    .map((taskId) => taskById.get(taskId))
    .filter((task): task is Task => {
      if (!task) return false
      return task.focusId.trim() === focusId && !isActiveTask(task)
    })
  if (resultTasks.length !== 1) return false
  const [task] = resultTasks
  if (!task) return false
  if (task.cwd.trim() !== params.item.task.cwd.trim()) return false
  if (!matchesDraftTaskMode({ task, item: params.item })) return false

  return true
}

export const supportsEnqueueContinuationIntentEvidence = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  taskById?: Map<string, Task>
  planById?: Map<string, TaskPlan>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
}): boolean =>
  supportsPlanContinuation({
    item: params.item,
    ...(params.planById ? { planById: params.planById } : {}),
    ...(params.defaultFocusId ? { defaultFocusId: params.defaultFocusId } : {}),
  }) ||
  supportsResultTaskContinuation({
    item: params.item,
    ...(params.taskById ? { taskById: params.taskById } : {}),
    ...(params.resultTaskIds ? { resultTaskIds: params.resultTaskIds } : {}),
    ...(params.defaultFocusId ? { defaultFocusId: params.defaultFocusId } : {}),
  })
