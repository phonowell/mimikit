import {
  parseIsoToMs,
  resolveTaskChangedAt,
} from '../../prompts/format-base.js'

import { selectByWindow } from './select-window.js'

import type { Task } from '../../types/index.js'

export type TaskSelectParams = {
  minCount: number
  maxCount: number
  maxBytes: number
}

export const selectRecentTasks = (
  tasks: Task[],
  params: TaskSelectParams,
): Task[] => {
  if (tasks.length === 0) return []
  const sorted = [...tasks].sort((a, b) => {
    const aTs = parseIsoToMs(resolveTaskChangedAt(a))
    const bTs = parseIsoToMs(resolveTaskChangedAt(b))
    if (aTs !== bTs) return bTs - aTs
    return a.id.localeCompare(b.id)
  })
  return selectByWindow(sorted, params, (task) =>
    Buffer.byteLength(JSON.stringify(task), 'utf8'),
  )
}
