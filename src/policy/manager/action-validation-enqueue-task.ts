import { isAbsolute, relative, resolve } from 'node:path'

import {
  formatEnqueueTaskBatchConflictHint,
  formatEnqueueTaskWorktreeRequiredHint,
} from './action-feedback-hints.js'
import { rejected, type ValidationIssue } from './action-validation-helpers.js'

import type { FeedbackContext } from './action-validation-context.js'
import type { Parsed } from '../actions/model/spec.js'

const normalizePath = (value: string): string => resolve(value.trim())

const isSameOrNestedPath = (base: string, target: string): boolean => {
  const relativePath = relative(base, target)
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  )
}

const hasPathOverlap = (left: string, right: string): boolean =>
  isSameOrNestedPath(left, right) || isSameOrNestedPath(right, left)

const collectConflictingEnqueuePaths = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  currentActions?: Parsed[] | undefined
}): string[] => {
  const itemCwd = normalizePath(params.item.task.cwd)
  const conflicts = new Set<string>()
  for (const candidate of params.currentActions ?? []) {
    if (candidate === params.item || candidate.type !== 'enqueue_task') continue
    const candidateCwd = normalizePath(candidate.task.cwd)
    if (!hasPathOverlap(itemCwd, candidateCwd)) continue
    conflicts.add(candidateCwd)
  }
  return [...conflicts]
}

const targetsStartupWorktreeWrite = (params: {
  startupWorktree?: string | undefined
  cwd: string
  mode: 'read' | 'write'
  useWorktree: boolean
}): boolean => {
  const startupWorktree = params.startupWorktree?.trim()
  if (!startupWorktree || params.mode !== 'write' || params.useWorktree)
    return false

  return isSameOrNestedPath(
    normalizePath(startupWorktree),
    normalizePath(params.cwd),
  )
}

export const validateEnqueueTaskManagerRules = (
  item: Extract<Parsed, { type: 'enqueue_task' }>,
  context: Pick<FeedbackContext, 'currentActions' | 'startupWorktree'>,
): ValidationIssue[] => {
  if (
    targetsStartupWorktreeWrite({
      startupWorktree: context.startupWorktree,
      cwd: item.task.cwd,
      mode: item.task.mode,
      useWorktree: item.task.use_worktree,
    })
  )
    return rejected(formatEnqueueTaskWorktreeRequiredHint())

  const conflictingPaths = collectConflictingEnqueuePaths({
    item,
    currentActions: context.currentActions,
  })
  if (conflictingPaths.length === 0) return []
  return rejected(
    formatEnqueueTaskBatchConflictHint(
      [normalizePath(item.task.cwd), ...conflictingPaths].join(', '),
    ),
  )
}
