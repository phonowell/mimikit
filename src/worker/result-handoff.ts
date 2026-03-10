import { clipCompactText } from '../shared/text.js'

import type { Task, TaskResult, TaskResultHandoff } from '../types/index.js'

const MAX_GOAL_CHARS = 200
const MAX_SUMMARY_CHARS = 280
const MAX_ITEM_CHARS = 180
const MAX_LIST_ITEMS = 5

const clipText = (value: string, maxChars: number): string =>
  clipCompactText(value, maxChars)

const pickSummaryLine = (output: string): string | undefined => {
  const lines = output.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('```')) continue
    return clipText(trimmed.replace(/^#{1,6}\s+/, ''), MAX_SUMMARY_CHARS)
  }
  const fallback = clipText(output, MAX_SUMMARY_CHARS)
  return fallback || undefined
}

const collectChecklistItems = (
  output: string,
  kind: 'checked' | 'unchecked',
): string[] => {
  const pattern =
    kind === 'checked'
      ? /^\s*(?:[-*+]|\d+[.)])\s+\[(?:x|X)\]\s+([\s\S]+?)\s*$/
      : /^\s*(?:[-*+]|\d+[.)])\s+\[\s\]\s+([\s\S]+?)\s*$/
  const items: string[] = []
  const seen = new Set<string>()
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(pattern)
    if (!match?.[1]) continue
    const normalized = clipText(match[1], MAX_ITEM_CHARS)
    if (!normalized || seen.has(normalized)) continue
    items.push(normalized)
    seen.add(normalized)
    if (items.length >= MAX_LIST_ITEMS) break
  }
  return items
}

const formatStatusSummary = (
  taskLabel: string,
  status: TaskResult['status'],
  detail?: string,
): string | undefined => {
  if (status === 'succeeded') {
    return detail
      ? `Task "${taskLabel}" completed: ${detail}`
      : `Task "${taskLabel}" completed.`
  }

  if (status === 'partial') {
    return detail
      ? `Task "${taskLabel}" paused with partial result: ${detail}`
      : `Task "${taskLabel}" paused with partial result.`
  }

  if (status === 'failed') {
    return detail
      ? `Task "${taskLabel}" failed: ${detail}`
      : `Task "${taskLabel}" failed.`
  }

  return detail
    ? `Task "${taskLabel}" canceled: ${detail}`
    : `Task "${taskLabel}" canceled.`
}

const buildRiskItems = (
  status: TaskResult['status'],
  taskLabel: string,
  summary?: string,
): string[] | undefined => {
  if (status === 'succeeded') return undefined
  const detail =
    summary ??
    (status === 'failed'
      ? `Task "${taskLabel}" failed.`
      : status === 'partial'
        ? `Task "${taskLabel}" paused with partial result.`
        : `Task "${taskLabel}" was canceled.`)
  return [clipText(detail, MAX_SUMMARY_CHARS)]
}

const dedupeArtifacts = (
  items: TaskResultHandoff['artifacts'],
): TaskResultHandoff['artifacts'] => {
  if (!items || items.length === 0) return undefined
  const merged: NonNullable<TaskResultHandoff['artifacts']> = []
  const seen = new Set<string>()
  for (const item of items) {
    const key = `${item.path}\n${item.kind ?? ''}\n${item.note ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }
  return merged.length > 0 ? merged : undefined
}

const dedupeEvidence = (
  items: TaskResultHandoff['evidence'],
): TaskResultHandoff['evidence'] => {
  if (!items || items.length === 0) return undefined
  const merged: NonNullable<TaskResultHandoff['evidence']> = []
  const seen = new Set<string>()
  for (const item of items) {
    const key = `${item.type}\n${item.ref}\n${item.note ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }
  return merged.length > 0 ? merged : undefined
}

export const buildTaskResultHandoff = (
  task: Task,
  result: Pick<TaskResult, 'status' | 'output'>,
): TaskResultHandoff | undefined => {
  const taskLabel = task.title.trim() || task.id
  const detail = pickSummaryLine(result.output)
  const summary = formatStatusSummary(taskLabel, result.status, detail)
  const goal = clipText(task.prompt, MAX_GOAL_CHARS)
  const decisions = collectChecklistItems(result.output, 'checked')
  const nextSteps = collectChecklistItems(result.output, 'unchecked')
  const risks = buildRiskItems(result.status, taskLabel, summary)
  if (
    !goal &&
    !summary &&
    decisions.length === 0 &&
    nextSteps.length === 0 &&
    !risks
  )
    return undefined

  return {
    ...(goal ? { goal } : {}),
    ...(summary ? { summary } : {}),
    ...(decisions.length > 0 ? { decisions } : {}),
    ...(nextSteps.length > 0 ? { nextSteps } : {}),
    ...(risks ? { risks } : {}),
  }
}

export const withTaskArchiveEvidence = (
  handoff: TaskResultHandoff | undefined,
  archivePath?: string,
): TaskResultHandoff | undefined => {
  const path = archivePath?.trim()
  if (!path) return handoff
  const next = handoff ? { ...handoff } : {}
  next.artifacts = dedupeArtifacts([
    ...(next.artifacts ?? []),
    {
      path,
      kind: 'task_archive',
    },
  ])
  next.evidence = dedupeEvidence([
    ...(next.evidence ?? []),
    {
      type: 'task_archive',
      ref: path,
    },
  ])
  return next
}
