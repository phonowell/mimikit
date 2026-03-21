import { parseIsoToMs } from '../shared/time.js'

import { isWildcardQuery } from './query-context-scope-shared.js'
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

const resolveTaskTime = (task: Task): number =>
  parseIsoToMs(task.completedAt ?? task.startedAt ?? task.createdAt)

type RankedRuntimeScopeItem = {
  id: string
  timeMs: number
  score: number
}

const rankRuntimeScope = <
  TCandidate,
  TItem extends RankedRuntimeScopeItem,
>(params: {
  query: string
  candidates: readonly TCandidate[]
  resolveTimeMs: (candidate: TCandidate) => number
  buildHaystack: (candidate: TCandidate) => string
  buildItem: (
    candidate: TCandidate,
    values: { timeMs: number; score: number },
  ) => TItem
}): TItem[] => {
  const wildcard = isWildcardQuery(params.query)
  const bounds = resolveTimeBounds(
    params.candidates.map((candidate) => params.resolveTimeMs(candidate)),
  )
  const ranked: TItem[] = []
  for (const candidate of params.candidates) {
    const timeMs = params.resolveTimeMs(candidate)
    const score = scoreQueryCandidate({
      query: params.query,
      isWildcard: wildcard,
      haystack: params.buildHaystack(candidate),
      timeMs,
      oldestMs: bounds.oldest,
      newestMs: bounds.newest,
    })
    if (!wildcard && score <= 0) continue
    ranked.push(params.buildItem(candidate, { timeMs, score }))
  }
  return sortByScoreTimeId(ranked)
}

const buildFocusSummary = (
  summary: string | undefined,
  openItems: string[] | undefined,
): string => {
  const summaryText = summary?.trim() ?? ''
  const openText = openItems?.join(' | ').trim() ?? ''
  if (summaryText && openText) return `${summaryText} | ${openText}`
  return summaryText || openText
}

const buildPlanEffectText = (
  plan: RuntimeState['taskPlans'][number],
): string => {
  if (plan.effect.kind === 'enqueue_task')
    return plan.effect.taskTemplate.prompt
  return plan.effect.reason
}

export const queryTasksScope = (
  runtime: RuntimeState,
  query: string,
  maxItemChars: number,
): QueryLookupTaskItem[] =>
  rankRuntimeScope<Task, QueryLookupTaskItem & { id: string; timeMs: number }>({
    query,
    candidates: runtime.tasks,
    resolveTimeMs: resolveTaskTime,
    buildHaystack: (task) =>
      [task.id, task.title, task.prompt, task.status, task.focusId].join('\n'),
    buildItem: (task, values) => ({
      id: task.id,
      timeMs: values.timeMs,
      score: values.score,
      ref: `task:${task.id}`,
      status: task.status,
      focusId: task.focusId,
      createdAt: task.createdAt,
      title: task.title,
      snippet: truncatePreview(task.prompt, maxItemChars),
    }),
  })

export const queryPlansScope = (
  runtime: RuntimeState,
  query: string,
  maxItemChars: number,
): QueryLookupPlanItem[] =>
  rankRuntimeScope({
    query,
    candidates: runtime.taskPlans,
    resolveTimeMs: (plan) => parseIsoToMs(plan.updatedAt),
    buildHaystack: (plan) =>
      [
        plan.id,
        plan.title,
        buildPlanEffectText(plan),
        plan.status,
        plan.trigger.mode,
        plan.focusId,
      ].join('\n'),
    buildItem: (plan, values) => ({
      id: plan.id,
      timeMs: values.timeMs,
      score: values.score,
      ref: `plan:${plan.id}`,
      status: plan.status,
      triggerMode: plan.trigger.mode,
      updatedAt: plan.updatedAt,
      title: plan.title,
      snippet: truncatePreview(buildPlanEffectText(plan), maxItemChars),
    }),
  })

export const queryFocusScope = (
  runtime: RuntimeState,
  query: string,
  maxItemChars: number,
): QueryLookupFocusItem[] =>
  rankRuntimeScope({
    query,
    candidates: runtime.focuses,
    resolveTimeMs: (focus) => parseIsoToMs(focus.updatedAt),
    buildHaystack: (focus) => {
      const summary = buildFocusSummary(focus.summary, focus.openItems)
      return [focus.id, focus.title, focus.status, summary].join('\n')
    },
    buildItem: (focus, values) => {
      const summary = buildFocusSummary(focus.summary, focus.openItems)
      const entry: QueryLookupFocusItem & { id: string; timeMs: number } = {
        id: focus.id,
        timeMs: values.timeMs,
        score: values.score,
        ref: `focus:${focus.id}`,
        status: focus.status,
        updatedAt: focus.updatedAt,
        title: focus.title,
      }
      if (summary) entry.summary = truncatePreview(summary, maxItemChars)
      return entry
    },
  })
