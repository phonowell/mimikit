import { resolveTaskResourceMode } from '../../work/shared/task-resource-mode.js'

import {
  isExactAnchorSupportedByInputs,
  isSupportedByInputs,
} from './action-intent-evidence-match.js'
import {
  matchesPlanToEnqueueDraft,
  matchesTaskToEnqueueDraft,
} from './authorization-semantics.js'

import type { Task, TaskPlan } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

type DraftWriteLane = {
  cwd: string
  mode: Extract<Task['resourceMode'], 'read' | 'write'>
  use_worktree?: boolean
}

type CurrentWriteLane = {
  cwd: string
  resourceMode: Task['resourceMode']
  useWorktree: boolean | undefined
}

const modeEvidenceLabels = (mode: DraftWriteLane['mode']): string[] =>
  mode === 'write'
    ? ['写入模式 (write)', '写入', 'write']
    : ['只读模式 (read)', '只读', 'read']

const worktreeEvidenceLabels = (useWorktree: boolean): string[] =>
  useWorktree
    ? ['使用 worktree', '用 worktree', 'worktree']
    : ['不使用 worktree', '不要用 worktree', '直接在仓库目录执行']

const hasExplicitLaneChangeEvidence = (params: {
  requiresCwdEvidence: boolean
  requiresModeEvidence: boolean
  requiresWorktreeEvidence: boolean
  next: DraftWriteLane
  inputTexts: string[]
}): boolean => {
  const checks: boolean[] = []
  if (params.requiresCwdEvidence) {
    checks.push(
      isExactAnchorSupportedByInputs({
        candidates: [params.next.cwd],
        inputs: params.inputTexts,
      }),
    )
  }
  if (params.requiresModeEvidence) {
    checks.push(
      isSupportedByInputs({
        candidates: modeEvidenceLabels(params.next.mode),
        inputs: params.inputTexts,
      }),
    )
  }
  if (params.requiresWorktreeEvidence) {
    checks.push(
      isSupportedByInputs({
        candidates: worktreeEvidenceLabels(params.next.use_worktree === true),
        inputs: params.inputTexts,
      }),
    )
  }
  return checks.every(Boolean)
}

const resolveEnqueueLaneEvidenceRequirements = (params: {
  targets: CurrentWriteLane[]
  next: DraftWriteLane
}) => ({
  requiresCwdEvidence: params.targets.some(
    (target) => target.cwd.trim() !== params.next.cwd.trim(),
  ),
  requiresModeEvidence: params.targets.some(
    (target) =>
      resolveTaskResourceMode(target.resourceMode) !== params.next.mode,
  ),
  requiresWorktreeEvidence: params.targets.some(
    (target) =>
      Boolean(target.useWorktree) !== (params.next.use_worktree === true),
  ),
})

const resolveSemanticWriteEnqueueContinuationTargets = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  taskById?: Map<string, Task>
  planById?: Map<string, TaskPlan>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
}): CurrentWriteLane[] => {
  const focusId = params.defaultFocusId?.trim()
  if (!focusId) return []
  const targets: CurrentWriteLane[] = []
  if (params.planById) {
    const plans = [...params.planById.values()].filter(
      (plan) =>
        plan.status === 'active' &&
        plan.focusId.trim() === focusId &&
        matchesPlanToEnqueueDraft(plan, params.item),
    )
    for (const plan of plans) {
      targets.push({
        cwd: plan.effect.taskTemplate.cwd,
        resourceMode: plan.effect.taskTemplate.resourceMode,
        useWorktree: plan.effect.taskTemplate.useWorktree,
      })
    }
  }
  if (params.taskById && params.resultTaskIds?.size) {
    const tasks = [...params.resultTaskIds]
      .map((taskId) => params.taskById?.get(taskId))
      .filter((task): task is Task => {
        if (!task) return false
        return (
          task.focusId.trim() === focusId &&
          matchesTaskToEnqueueDraft(task, params.item)
        )
      })
    for (const task of tasks) {
      targets.push({
        cwd: task.cwd,
        resourceMode: task.resourceMode,
        useWorktree: Boolean(task.git),
      })
    }
  }
  return targets
}

export const matchesWriteEnqueueLane = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  cwd: string
  resourceMode: Task['resourceMode']
  useWorktree: boolean | undefined
}): boolean =>
  params.cwd.trim() === params.item.task.cwd.trim() &&
  resolveTaskResourceMode(params.resourceMode) === params.item.task.mode &&
  Boolean(params.useWorktree) === (params.item.task.use_worktree === true)

export const requiresExplicitWriteEnqueueLaneEvidence = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  inputTexts: string[]
  taskById?: Map<string, Task>
  planById?: Map<string, TaskPlan>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
}): boolean => {
  const targets = resolveSemanticWriteEnqueueContinuationTargets(params)
  if (targets.length === 0) return false
  return !hasExplicitLaneChangeEvidence({
    ...resolveEnqueueLaneEvidenceRequirements({
      targets,
      next: params.item.task,
    }),
    next: params.item.task,
    inputTexts: params.inputTexts,
  })
}

export const requiresExplicitWritePlanUpdateLaneEvidence = (params: {
  item: Extract<Parsed, { type: 'set_plan' }>
  inputTexts: string[]
  planById?: Map<string, TaskPlan>
}): boolean => {
  if (params.item.plan_id === null) return false
  const currentPlan = params.planById?.get(params.item.plan_id)
  if (!currentPlan) return false
  return !hasExplicitLaneChangeEvidence({
    requiresCwdEvidence:
      currentPlan.effect.taskTemplate.cwd.trim() !==
      params.item.plan.task.cwd.trim(),
    requiresModeEvidence:
      resolveTaskResourceMode(currentPlan.effect.taskTemplate.resourceMode) !==
      params.item.plan.task.mode,
    requiresWorktreeEvidence:
      Boolean(currentPlan.effect.taskTemplate.useWorktree) !==
      (params.item.plan.task.use_worktree === true),
    next: params.item.plan.task,
    inputTexts: params.inputTexts,
  })
}
