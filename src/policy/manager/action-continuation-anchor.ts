import { isActiveTask } from '../../work/orchestrator/task-state.js'
import { resolveTaskResourceMode } from '../../work/shared/task-resource-mode.js'

import type { FeedbackContext } from './action-validation-context.js'
import type { TaskResourceMode } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const hasCurrentFocus = (focusId: string, defaultFocusId?: string): boolean => {
  const normalized = defaultFocusId?.trim()
  if (!normalized) return true
  return focusId.trim() === normalized
}

const matchesDraftTaskMode = (params: {
  resourceMode: TaskResourceMode | undefined
  mode: 'read' | 'write'
  hasGit: boolean
  useWorktree: boolean | undefined
}): boolean =>
  resolveTaskResourceMode(params.resourceMode) === params.mode &&
  params.hasGit === (params.useWorktree === true)

export const supportsExplicitEnqueueContinuationAnchor = (
  item: Extract<Parsed, { type: 'enqueue_task' }>,
  context: Pick<
    FeedbackContext,
    'planById' | 'taskById' | 'resultTaskIds' | 'defaultFocusId'
  >,
): boolean | undefined => {
  const anchor = item.continuation_of
  if (!anchor) return undefined
  if (anchor.type === 'plan') {
    const plan = context.planById?.get(anchor.id)
    if (plan?.status !== 'active') return false
    if (!hasCurrentFocus(plan.focusId, context.defaultFocusId)) return false
    if (plan.effect.taskTemplate.cwd.trim() !== item.task.cwd.trim())
      return false
    if (
      !matchesDraftTaskMode({
        resourceMode: plan.effect.taskTemplate.resourceMode,
        mode: item.task.mode,
        hasGit: Boolean(plan.effect.taskTemplate.useWorktree),
        useWorktree: item.task.use_worktree,
      })
    )
      return false
    if (!context.resultTaskIds?.size) return true
    const lastTaskId = plan.runtime.lastTaskId?.trim()
    if (!lastTaskId) return false
    return Boolean(lastTaskId) && context.resultTaskIds.has(lastTaskId)
  }

  const task = context.taskById?.get(anchor.id)
  if (!task || isActiveTask(task)) return false
  if (!hasCurrentFocus(task.focusId, context.defaultFocusId)) return false
  if (task.cwd.trim() !== item.task.cwd.trim()) return false
  if (
    !matchesDraftTaskMode({
      resourceMode: task.resourceMode,
      mode: item.task.mode,
      hasGit: Boolean(task.git),
      useWorktree: item.task.use_worktree,
    })
  )
    return false
  if (!context.resultTaskIds?.size) return true
  return context.resultTaskIds.has(task.id)
}

export const supportsExplicitSetPlanContinuationAnchor = (
  item: Extract<Parsed, { type: 'set_plan' }>,
  context: Pick<
    FeedbackContext,
    'planById' | 'taskById' | 'resultTaskIds' | 'defaultFocusId'
  >,
): boolean | undefined => {
  const anchor = item.continuation_of
  if (!anchor) return undefined
  if (anchor.type === 'plan') {
    const plan = context.planById?.get(anchor.id)
    if (plan?.status !== 'active') return false
    if (!hasCurrentFocus(plan.focusId, context.defaultFocusId)) return false
    if (plan.effect.taskTemplate.cwd.trim() !== item.plan.task.cwd.trim())
      return false
    if (
      !matchesDraftTaskMode({
        resourceMode: plan.effect.taskTemplate.resourceMode,
        mode: item.plan.task.mode,
        hasGit: Boolean(plan.effect.taskTemplate.useWorktree),
        useWorktree: item.plan.task.use_worktree,
      })
    )
      return false
    if (!context.resultTaskIds?.size) return true
    const lastTaskId = plan.runtime.lastTaskId?.trim()
    if (!lastTaskId) return false
    return Boolean(lastTaskId) && context.resultTaskIds.has(lastTaskId)
  }

  const task = context.taskById?.get(anchor.id)
  if (!task || isActiveTask(task)) return false
  if (!hasCurrentFocus(task.focusId, context.defaultFocusId)) return false
  if (task.cwd.trim() !== item.plan.task.cwd.trim()) return false
  if (
    !matchesDraftTaskMode({
      resourceMode: task.resourceMode,
      mode: item.plan.task.mode,
      hasGit: Boolean(task.git),
      useWorktree: item.plan.task.use_worktree,
    })
  )
    return false
  if (!context.resultTaskIds?.size) return true
  return context.resultTaskIds.has(task.id)
}
