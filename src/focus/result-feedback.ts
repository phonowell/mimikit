import { MAX_FOCUS_OPEN_ITEMS } from './constants.js'
import { normalizeFocusOpenItems } from './open-items.js'
import { touchFocus, upsertFocusContext } from './state.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task, TaskResult } from '../types/index.js'

const MAX_RESULT_SUMMARY_CHARS = 280
const MAX_OPEN_ITEM_CHARS = 180

const compactText = (value: string): string => value.replace(/\s+/g, ' ').trim()

const clipText = (value: string, maxChars: number): string => {
  const normalized = compactText(value)
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`
}

const resolveTaskLabel = (task: Task): string => {
  const title = task.title.trim()
  if (title.length > 0) return title
  return task.id
}

const normalizeSummaryLine = (line: string): string => {
  const withoutHeading = line.replace(/^#{1,6}\s+/, '')
  const withoutListPrefix = withoutHeading.replace(
    /^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/,
    '',
  )
  return clipText(withoutListPrefix, MAX_RESULT_SUMMARY_CHARS)
}

const pickSummaryLine = (output: string): string | undefined => {
  const lines = output.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    if (trimmed.startsWith('```')) continue
    const normalized = normalizeSummaryLine(trimmed)
    if (normalized.length > 0) return normalized
  }
  const compacted = clipText(output, MAX_RESULT_SUMMARY_CHARS)
  return compacted.length > 0 ? compacted : undefined
}

const formatSummary = (task: Task, result: TaskResult): string => {
  const label = resolveTaskLabel(task)
  const detail = pickSummaryLine(result.output)
  if (result.status === 'succeeded')
    return detail ?? `Task "${label}" completed.`
  if (result.status === 'failed') {
    return detail
      ? `Task "${label}" failed: ${detail}`
      : `Task "${label}" failed.`
  }
  return detail
    ? `Task "${label}" canceled: ${detail}`
    : `Task "${label}" canceled.`
}

const normalizeOpenItemText = (item: string): string =>
  clipText(item, MAX_OPEN_ITEM_CHARS)

const resolveHandoffSummary = (result: TaskResult): string | undefined => {
  const summary = result.handoff?.summary?.trim()
  if (!summary) return undefined
  return clipText(summary, MAX_RESULT_SUMMARY_CHARS)
}

const resolveHandoffNextSteps = (result: TaskResult): string[] => {
  const steps = result.handoff?.nextSteps
  if (!steps || steps.length === 0) return []
  const normalized: string[] = []
  const seen = new Set<string>()
  for (const item of steps) {
    const text = normalizeOpenItemText(item)
    if (!text || seen.has(text)) continue
    normalized.push(text)
    seen.add(text)
    if (normalized.length >= MAX_FOCUS_OPEN_ITEMS) break
  }
  return normalized
}

const collectOpenItemsFromOutput = (output: string): string[] => {
  const lines = output.split(/\r?\n/)
  const collected: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const match = line.match(/^\s*(?:[-*+]|\d+[.)])\s+\[\s\]\s+([\s\S]+?)\s*$/)
    if (!match?.[1]) continue
    const normalized = normalizeOpenItemText(match[1])
    if (normalized.length === 0) continue
    if (seen.has(normalized)) continue
    collected.push(normalized)
    seen.add(normalized)
    if (collected.length >= MAX_FOCUS_OPEN_ITEMS) break
  }
  return collected
}

const hasChecklistSignal = (output: string): boolean =>
  output
    .split(/\r?\n/)
    .some((line) =>
      /^\s*(?:[-*+]|\d+[.)])\s+\[(?: |x|X)\]\s+[\s\S]+$/.test(line),
    )

const buildFollowupOpenItem = (task: Task, result: TaskResult): string => {
  const label = resolveTaskLabel(task)
  const detail = pickSummaryLine(result.output)
  if (result.status === 'failed') {
    const text = detail
      ? `Resolve failure in "${label}": ${detail}`
      : `Resolve failure in "${label}".`
    return normalizeOpenItemText(text)
  }
  const text = detail
    ? `Resume "${label}" after cancellation: ${detail}`
    : `Resume "${label}" after cancellation.`
  return normalizeOpenItemText(text)
}

const mergeOpenItems = (
  existing: readonly string[] | undefined,
  nextItem: string,
): string[] => {
  const merged: string[] = []
  const normalizedExisting = normalizeFocusOpenItems(existing, {
    maxItems: MAX_FOCUS_OPEN_ITEMS,
    coerceNonString: true,
  })
  if (normalizedExisting) {
    for (const item of normalizedExisting) {
      if (merged.includes(item)) continue
      merged.push(item)
    }
  }
  if (!merged.includes(nextItem)) merged.push(nextItem)
  return (
    normalizeFocusOpenItems(merged, {
      maxItems: MAX_FOCUS_OPEN_ITEMS,
    }) ?? []
  )
}

const mergeOpenItemList = (
  existing: readonly string[] | undefined,
  nextItems: readonly string[],
): string[] => {
  const merged: string[] = []
  const normalizedExisting = normalizeFocusOpenItems(existing, {
    maxItems: MAX_FOCUS_OPEN_ITEMS,
    coerceNonString: true,
  })
  if (normalizedExisting) {
    for (const item of normalizedExisting) {
      if (merged.includes(item)) continue
      merged.push(item)
    }
  }
  for (const item of nextItems) {
    if (merged.includes(item)) continue
    merged.push(item)
    if (merged.length >= MAX_FOCUS_OPEN_ITEMS) break
  }
  return (
    normalizeFocusOpenItems(merged, {
      maxItems: MAX_FOCUS_OPEN_ITEMS,
    }) ?? []
  )
}

const resolveNextOpenItems = (
  currentOpenItems: readonly string[] | undefined,
  task: Task,
  result: TaskResult,
): string[] => {
  const handoffNextSteps = resolveHandoffNextSteps(result)
  if (result.status === 'succeeded') {
    if (handoffNextSteps.length > 0) return handoffNextSteps
    const extracted = collectOpenItemsFromOutput(result.output)
    if (extracted.length > 0) return extracted
    if (hasChecklistSignal(result.output)) return []
    return (
      normalizeFocusOpenItems(currentOpenItems, {
        maxItems: MAX_FOCUS_OPEN_ITEMS,
        coerceNonString: true,
      }) ?? []
    )
  }
  if (handoffNextSteps.length > 0)
    return mergeOpenItemList(currentOpenItems, handoffNextSteps)
  return mergeOpenItems(currentOpenItems, buildFollowupOpenItem(task, result))
}

export const syncFocusContextFromTaskResult = (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
): void => {
  const focusId = task.focusId.trim()
  if (focusId.length === 0) return
  const current = runtime.focusContexts.find((item) => item.focusId === focusId)
  const summary = resolveHandoffSummary(result) ?? formatSummary(task, result)
  upsertFocusContext(runtime, {
    focusId,
    summary,
    openItems: resolveNextOpenItems(current?.openItems, task, result),
  })
  touchFocus(runtime, focusId)
}
