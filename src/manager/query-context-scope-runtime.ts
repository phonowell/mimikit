import { parseIsoToMs } from '../shared/time.js'

import {
  scoreQueryCandidate,
  sortByScoreTimeId,
  truncatePreview,
} from './query-context-score.js'

import type { RuntimeState } from './runtime-adapter.js'
import type {
  QueryLookupFocusItem,
  QueryLookupPlanItem,
  QueryLookupTaskItem,
  Task,
} from '../types/index.js'

const resolveTimeBounds = (
  times: number[],
): { oldest: number; newest: number } => {
  if (times.length === 0) return { oldest: 0, newest: 0 }
  return {
    oldest: Math.min(...times),
    newest: Math.max(...times),
  }
}

const isWildcardQuery = (query: string): boolean => query.trim() === '*'

const resolveTaskTime = (task: Task): number =>
  parseIsoToMs(task.completedAt ?? task.startedAt ?? task.createdAt)

const buildFocusSummary = (
  summary: string | undefined,
  openItems: string[] | undefined,
): string => {
  const summaryText = summary?.trim() ?? ''
  const openText = openItems?.join(' | ').trim() ?? ''
  if (summaryText && openText) return `${summaryText} | ${openText}`
  return summaryText || openText
}

export const queryTasksScope = (
  runtime: RuntimeState,
  query: string,
  maxItemChars: number,
): QueryLookupTaskItem[] => {
  const wildcard = isWildcardQuery(query)
  const candidates = runtime.tasks
  const bounds = resolveTimeBounds(candidates.map(resolveTaskTime))
  const ranked = candidates
    .map((task) => {
      const timeMs = resolveTaskTime(task)
      const score = scoreQueryCandidate({
        query,
        isWildcard: wildcard,
        haystack: [
          task.id,
          task.title,
          task.prompt,
          task.status,
          task.focusId,
        ].join('\n'),
        timeMs,
        oldestMs: bounds.oldest,
        newestMs: bounds.newest,
      })
      if (!wildcard && score <= 0) return undefined
      return {
        id: task.id,
        timeMs,
        score,
        ref: `task:${task.id}`,
        status: task.status,
        focusId: task.focusId,
        createdAt: task.createdAt,
        title: task.title,
        snippet: truncatePreview(task.prompt, maxItemChars),
      } satisfies QueryLookupTaskItem & { timeMs: number }
    })
    .filter(
      (item): item is QueryLookupTaskItem & { timeMs: number; id: string } =>
        Boolean(item),
    )
  return sortByScoreTimeId(ranked)
}

export const queryPlansScope = (
  runtime: RuntimeState,
  query: string,
  maxItemChars: number,
): QueryLookupPlanItem[] => {
  const wildcard = isWildcardQuery(query)
  const candidates = runtime.taskPlans
  const bounds = resolveTimeBounds(
    candidates.map((plan) => parseIsoToMs(plan.updatedAt)),
  )
  const ranked = candidates
    .map((plan) => {
      const timeMs = parseIsoToMs(plan.updatedAt)
      const score = scoreQueryCandidate({
        query,
        isWildcard: wildcard,
        haystack: [
          plan.id,
          plan.title,
          plan.prompt,
          plan.status,
          plan.trigger.mode,
          plan.focusId,
        ].join('\n'),
        timeMs,
        oldestMs: bounds.oldest,
        newestMs: bounds.newest,
      })
      if (!wildcard && score <= 0) return undefined
      return {
        id: plan.id,
        timeMs,
        score,
        ref: `plan:${plan.id}`,
        status: plan.status,
        triggerMode: plan.trigger.mode,
        updatedAt: plan.updatedAt,
        title: plan.title,
        snippet: truncatePreview(plan.prompt, maxItemChars),
      } satisfies QueryLookupPlanItem & { timeMs: number }
    })
    .filter(
      (item): item is QueryLookupPlanItem & { timeMs: number; id: string } =>
        Boolean(item),
    )
  return sortByScoreTimeId(ranked)
}

export const queryFocusScope = (
  runtime: RuntimeState,
  query: string,
  maxItemChars: number,
): QueryLookupFocusItem[] => {
  const wildcard = isWildcardQuery(query)
  const contextById = new Map(
    runtime.focusContexts.map((item) => [item.focusId, item]),
  )
  const candidates = runtime.focuses
  const bounds = resolveTimeBounds(
    candidates.map((focus) => parseIsoToMs(focus.updatedAt)),
  )
  const ranked: Array<QueryLookupFocusItem & { id: string; timeMs: number }> =
    []
  for (const focus of candidates) {
    const context = contextById.get(focus.id)
    const summary = buildFocusSummary(context?.summary, context?.openItems)
    const timeMs = parseIsoToMs(focus.updatedAt)
    const score = scoreQueryCandidate({
      query,
      isWildcard: wildcard,
      haystack: [focus.id, focus.title, focus.status, summary].join('\n'),
      timeMs,
      oldestMs: bounds.oldest,
      newestMs: bounds.newest,
    })
    if (!wildcard && score <= 0) continue
    const entry: QueryLookupFocusItem & { id: string; timeMs: number } = {
      id: focus.id,
      timeMs,
      score,
      ref: `focus:${focus.id}`,
      status: focus.status,
      updatedAt: focus.updatedAt,
      title: focus.title,
    }
    if (summary) entry.summary = truncatePreview(summary, maxItemChars)
    ranked.push(entry)
  }
  return sortByScoreTimeId(ranked)
}
