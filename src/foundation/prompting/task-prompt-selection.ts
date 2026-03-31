import { resolveTaskChangedAt, sortTasksByChangedAt } from './format-base.js'

import type { Task, TaskResult } from '../types/index.js'

export type TaskPromptPayloadOptions = {
  workingFocusIds?: string[] | undefined
  latestResultTaskId?: string | undefined
}

export type PromptSelectionSummary = {
  selected: number
  full: number
  card: number
}

export const selectTasksForPrompt = (tasks: Task[]): Task[] =>
  sortTasksByChangedAt(tasks)

export const shouldExpandTaskEntry = (
  task: Task,
  options?: TaskPromptPayloadOptions,
): boolean => {
  if (!options) return true
  if (
    task.status === 'pending' ||
    task.status === 'running' ||
    task.status === 'paused'
  )
    return true

  if (options.latestResultTaskId && task.id === options.latestResultTaskId)
    return true
  if (options.workingFocusIds?.includes(task.focusId)) return true
  return false
}

const orderTasksForPrompt = (
  tasks: Task[],
  options?: TaskPromptPayloadOptions,
): Task[] => {
  const ordered = selectTasksForPrompt(tasks)
  if (!options) return ordered
  return [...ordered].sort((left, right) => {
    const leftExpanded = shouldExpandTaskEntry(left, options) ? 0 : 1
    const rightExpanded = shouldExpandTaskEntry(right, options) ? 0 : 1
    if (leftExpanded !== rightExpanded) return leftExpanded - rightExpanded
    const changedDiff = resolveTaskChangedAt(right).localeCompare(
      resolveTaskChangedAt(left),
    )
    if (changedDiff !== 0) return changedDiff
    return left.id.localeCompare(right.id)
  })
}

export const buildTaskPromptEntries = (params: {
  tasks: Task[]
  results: TaskResult[]
  workDir?: string
  options?: TaskPromptPayloadOptions
  formatExpanded: (
    task: Task,
    result: TaskResult | undefined,
  ) => Record<string, unknown>
  formatCard: (
    task: Task,
    result: TaskResult | undefined,
  ) => Record<string, unknown>
}): {
  entries: Record<string, unknown>[]
  selection: PromptSelectionSummary
} => {
  if (params.tasks.length === 0)
    return { entries: [], selection: { selected: 0, full: 0, card: 0 } }

  const resultById = new Map(
    params.results.map((result) => [result.taskId, result] as const),
  )
  const orderedTasks = orderTasksForPrompt(params.tasks, params.options)
  let full = 0
  let card = 0
  const entries = orderedTasks.map((task) => {
    const result = resultById.get(task.id)
    if (shouldExpandTaskEntry(task, params.options)) {
      full += 1
      return params.formatExpanded(task, result)
    }
    card += 1
    return params.formatCard(task, result)
  })

  return {
    entries,
    selection: { selected: entries.length, full, card },
  }
}
