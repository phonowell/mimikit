import { clipCompactText } from '../../foundation/shared/text.js'
import { resolveTaskGitLifecycle } from '../../work/shared/task-git-lifecycle.js'
import {
  formatTaskResultSummary,
  pickTaskResultSummaryLine,
  resolveTaskLabel,
} from '../../work/shared/task-state.js'

import { buildStructuredTaskHandoff } from './task-handoff-protocol.js'

import type {
  Task,
  TaskResult,
  TaskResultHandoff,
} from '../../foundation/types/index.js'

const MAX_SUMMARY_CHARS = 280
const MAX_ITEM_CHARS = 180
const MAX_LIST_ITEMS = 5

const clipText = (value: string, maxChars: number): string =>
  clipCompactText(value, maxChars)

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

const buildRiskItems = (
  status: TaskResult['status'],
  taskLabel: string,
  summary?: string,
): string[] | undefined => {
  if (status === 'succeeded') return undefined
  return [
    clipText(
      summary ?? formatTaskResultSummary(taskLabel, status),
      MAX_SUMMARY_CHARS,
    ),
  ]
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
  structuredHandoff?: TaskResultHandoff,
): TaskResultHandoff | undefined => {
  if (structuredHandoff) return structuredHandoff
  if (result.status === 'succeeded') return undefined

  const taskLabel = resolveTaskLabel(task)
  const detail = pickTaskResultSummaryLine(result.output, MAX_SUMMARY_CHARS)
  const summary = formatTaskResultSummary(taskLabel, result.status, detail)
  const decisions = collectChecklistItems(result.output, 'checked')
  const nextSteps = collectChecklistItems(result.output, 'unchecked')
  const risks = buildRiskItems(result.status, taskLabel, summary)
  if (!summary && decisions.length === 0 && nextSteps.length === 0 && !risks)
    return undefined

  const gitLifecycle = resolveTaskGitLifecycle(task)
  const git =
    task.git &&
    ({
      ...task.git,
      ...(gitLifecycle ? { lifecycle: gitLifecycle } : {}),
    } satisfies NonNullable<TaskResultHandoff['git']>)

  return {
    ...(summary ? { summary } : {}),
    ...(decisions.length > 0 ? { decisions } : {}),
    ...(nextSteps.length > 0 ? { nextSteps } : {}),
    ...(risks ? { risks } : {}),
    ...(git ? { git } : {}),
  }
}

export const normalizeWorkerStructuredHandoff = (params: {
  task: Task
  handoff: unknown
}): TaskResultHandoff =>
  buildStructuredTaskHandoff({
    git: params.task.git,
    handoff: params.handoff,
  }) ?? {}

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
