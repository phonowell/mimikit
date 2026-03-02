import { sortTasksByChangedAt } from '../../prompts/format-base.js'

import type { Task, TaskTemplate, TemplatePriority } from '../../types/index.js'

export type WindowSelectParams = {
  minCount: number
  maxCount: number
  maxBytes: number
}

const normalizeWindowParams = (
  params: WindowSelectParams,
): WindowSelectParams => {
  const minCount = Math.max(0, params.minCount)
  const maxCount = Math.max(minCount, params.maxCount)
  const maxBytes = Math.max(0, params.maxBytes)
  return { minCount, maxCount, maxBytes }
}

export const selectByWindow = <T>(
  items: T[],
  params: WindowSelectParams,
  estimateBytes: (item: T) => number,
): T[] => {
  const normalized = normalizeWindowParams(params)
  if (items.length === 0 || normalized.maxCount === 0) return []
  const selected: T[] = []
  let totalBytes = 0
  for (const item of items) {
    const rawBytes = estimateBytes(item)
    const itemBytes = Number.isFinite(rawBytes) && rawBytes > 0 ? rawBytes : 0
    totalBytes += itemBytes
    selected.push(item)
    if (selected.length >= normalized.maxCount) break
    if (normalized.maxBytes > 0 && totalBytes > normalized.maxBytes)
      if (selected.length >= normalized.minCount) break
  }
  return selected
}

const PRIORITY_RANK: Record<TemplatePriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
}

const toMs = (value: string | undefined): number => {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const comparePriorityFifo = (a: TaskTemplate, b: TaskTemplate): number => {
  const priorityRank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if (priorityRank !== 0) return priorityRank
  const createdDiff = toMs(a.createdAt) - toMs(b.createdAt)
  if (createdDiff !== 0) return createdDiff
  return a.id.localeCompare(b.id)
}

const compareDoneDesc = (a: TaskTemplate, b: TaskTemplate): number => {
  const aChanged = toMs(a.archivedAt ?? a.updatedAt)
  const bChanged = toMs(b.archivedAt ?? b.updatedAt)
  if (aChanged !== bChanged) return bChanged - aChanged
  return a.id.localeCompare(b.id)
}

const statusRank = (status: TaskTemplate['status']): number => {
  if (status === 'active') return 0
  if (status === 'blocked') return 1
  return 2
}

export const sortTaskTemplates = (templates: TaskTemplate[]): TaskTemplate[] =>
  [...templates].sort((a, b) => {
    const rankDiff = statusRank(a.status) - statusRank(b.status)
    if (rankDiff !== 0) return rankDiff
    if (a.status === 'done') return compareDoneDesc(a, b)
    return comparePriorityFifo(a, b)
  })

export const selectRecentTemplates = (
  templates: TaskTemplate[],
  params: WindowSelectParams,
): TaskTemplate[] => {
  if (templates.length === 0) return []
  const sorted = sortTaskTemplates(templates)
  return selectByWindow(sorted, params, (item) =>
    Buffer.byteLength(JSON.stringify(item), 'utf8'),
  )
}

export const selectOnIdleTemplatesForTrigger = (
  templates: TaskTemplate[],
  nowMs: number = Date.now(),
): TaskTemplate[] =>
  [...templates]
    .filter((template) => {
      if (template.status !== 'active') return false
      if (template.trigger.mode !== 'on_idle') return false
      if (template.maxRuns !== undefined && template.runCount >= template.maxRuns)
        return false
      const cooldownMs = Math.max(0, template.trigger.cooldownMs)
      if (cooldownMs === 0) return true
      const lastCompletedMs = toMs(template.lastCompletedAt)
      if (lastCompletedMs <= 0) return true
      return nowMs - lastCompletedMs >= cooldownMs
    })
    .sort(comparePriorityFifo)

export const selectRecentTasks = (
  tasks: Task[],
  params: WindowSelectParams,
): Task[] => {
  if (tasks.length === 0) return []
  const sorted = sortTasksByChangedAt(tasks)
  return selectByWindow(sorted, params, (task) =>
    Buffer.byteLength(JSON.stringify(task), 'utf8'),
  )
}
