import { parseIsoToMs } from '../shared/time.js'

import { scoreQueryCandidate, sortByScoreTimeId, truncatePreview } from './query-context-score.js'

import type {
  QueryLookupFocusItem,
  QueryLookupPlanItem,
  QueryLookupTaskItem,
  Task,
} from '../types/index.js'
import type { RuntimeState } from './runtime-adapter.js'
import type { QueryContextRequest } from './query-context-schema.js'

const isWithinRange = (
  timestamp: string | undefined,
  request: QueryContextRequest,
): boolean => {
  const ms = timestamp ? parseIsoToMs(timestamp) : 0
  if (request.fromMs !== undefined && ms < request.fromMs) return false
  if (request.toMs !== undefined && ms > request.toMs) return false
  return true
}

const resolveTimeBounds = (times: number[]): { oldest: number; newest: number } => {
  if (times.length === 0) return { oldest: 0, newest: 0 }
  return {
    oldest: Math.min(...times),
    newest: Math.max(...times),
  }
}

const isWildcardQuery = (query: string): boolean => query.trim() === '*'

const resolveTaskTime = (task: Task): number =>
  parseIsoToMs(task.completedAt ?? task.startedAt ?? task.createdAt)

const buildFocusSummary = (summary: string | undefined, openItems: string[] | undefined): string => {
  const summaryText = summary?.trim() ?? ''
  const openText = openItems?.join(' | ').trim() ?? ''
  if (summaryText && openText) return `${summaryText} | ${openText}`
  return summaryText || openText
}

export const queryTasksScope = (
  runtime: RuntimeState,
  request: QueryContextRequest,
): QueryLookupTaskItem[] => {
  const wildcard = isWildcardQuery(request.query)
  const candidates = runtime.tasks.filter((task) => {
    if (request.focusId && task.focusId !== request.focusId) return false
    if (request.taskStatus && !request.taskStatus.includes(task.status)) return false
    return isWithinRange(task.completedAt ?? task.startedAt ?? task.createdAt, request)
  })
  const bounds = resolveTimeBounds(candidates.map(resolveTaskTime))
  const ranked = candidates
    .map((task) => {
      const timeMs = resolveTaskTime(task)
      const score = scoreQueryCandidate({
        query: request.query,
        isWildcard: wildcard,
        haystack: [task.id, task.title, task.prompt, task.status, task.focusId].join('\n'),
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
        snippet: truncatePreview(task.prompt, request.maxItemChars),
      } satisfies QueryLookupTaskItem & { timeMs: number }
    })
    .filter((item): item is QueryLookupTaskItem & { timeMs: number; id: string } => Boolean(item))
  return sortByScoreTimeId(ranked)
}

export const queryPlansScope = (
  runtime: RuntimeState,
  request: QueryContextRequest,
): QueryLookupPlanItem[] => {
  const wildcard = isWildcardQuery(request.query)
  const candidates = runtime.taskPlans.filter((plan) => {
    if (request.focusId && plan.focusId !== request.focusId) return false
    if (request.planStatus && !request.planStatus.includes(plan.status)) return false
    return isWithinRange(plan.updatedAt, request)
  })
  const bounds = resolveTimeBounds(candidates.map((plan) => parseIsoToMs(plan.updatedAt)))
  const ranked = candidates
    .map((plan) => {
      const timeMs = parseIsoToMs(plan.updatedAt)
      const score = scoreQueryCandidate({
        query: request.query,
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
        snippet: truncatePreview(plan.prompt, request.maxItemChars),
      } satisfies QueryLookupPlanItem & { timeMs: number }
    })
    .filter((item): item is QueryLookupPlanItem & { timeMs: number; id: string } => Boolean(item))
  return sortByScoreTimeId(ranked)
}

export const queryFocusScope = (
  runtime: RuntimeState,
  request: QueryContextRequest,
): QueryLookupFocusItem[] => {
  const wildcard = isWildcardQuery(request.query)
  const contextById = new Map(runtime.focusContexts.map((item) => [item.focusId, item]))
  const candidates = runtime.focuses.filter((focus) => {
    if (request.focusId && focus.id !== request.focusId) return false
    return isWithinRange(focus.updatedAt, request)
  })
  const bounds = resolveTimeBounds(candidates.map((focus) => parseIsoToMs(focus.updatedAt)))
  const ranked: Array<QueryLookupFocusItem & { id: string; timeMs: number }> = []
  for (const focus of candidates) {
    const context = contextById.get(focus.id)
    const summary = buildFocusSummary(context?.summary, context?.openItems)
    const timeMs = parseIsoToMs(focus.updatedAt)
    const score = scoreQueryCandidate({
      query: request.query,
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
    if (summary) entry.summary = truncatePreview(summary, request.maxItemChars)
    ranked.push(entry)
  }
  return sortByScoreTimeId(ranked)
}
