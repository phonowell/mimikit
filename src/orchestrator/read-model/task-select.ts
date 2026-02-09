import { selectByWindow } from './select-window.js'

import type { Task } from '../../types/index.js'

export type TaskSelectParams = {
  minCount: number
  maxCount: number
  maxBytes: number
}

const resolveTaskChangedAt = (task: Task): string =>
  task.completedAt ?? task.startedAt ?? task.createdAt

const parseIsoToMs = (value: string): number => {
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
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
