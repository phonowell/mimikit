import {
  isBudgetRecoverableTask,
  resolveTaskLabel,
} from '../../shared/task-state.js'
import { compareIsoDesc } from '../../shared/time.js'

import type { ChatMessage } from './chat-view.js'
import type { PendingUserChoice, Task } from '../../types/index.js'

export type ReviewStatusCard = {
  id: 'done' | 'recoverable' | 'failed' | 'needs_input' | 'resumed'
  label: string
  value: number
  tone: 'success' | 'warning' | 'accent' | 'neutral'
}

export type ReviewStatusHighlight = {
  id: string
  title: string
  detail: string
  tone: 'success' | 'warning' | 'accent'
  at: string
}

export type ReviewStatusView = {
  cards: ReviewStatusCard[]
  highlights: ReviewStatusHighlight[]
}

const MAX_HIGHLIGHTS = 4

const isSystemEvent = (message: ChatMessage, name: string): boolean =>
  message.role === 'system' && message.systemEventName === name

const buildRecoverableHighlights = (tasks: Task[]): ReviewStatusHighlight[] =>
  tasks
    .filter(isBudgetRecoverableTask)
    .map((task) => ({
      id: `recoverable-${task.id}`,
      title: resolveTaskLabel(task),
      detail:
        task.result?.handoff?.summary?.trim() ??
        'Partial result is ready to continue.',
      tone: 'warning' as const,
      at: task.pausedAt ?? task.result?.completedAt ?? task.createdAt,
    }))
    .sort((left, right) => compareIsoDesc(left.at, right.at))

const buildFailedHighlights = (tasks: Task[]): ReviewStatusHighlight[] =>
  tasks
    .filter((task) => task.status === 'failed')
    .map((task) => ({
      id: `failed-${task.id}`,
      title: resolveTaskLabel(task),
      detail:
        task.result?.handoff?.summary?.trim() ??
        task.result?.output.trim().split(/\r?\n/, 1).at(0)?.trim() ??
        'Task failed and needs review.',
      tone: 'accent' as const,
      at: task.completedAt ?? task.result?.completedAt ?? task.createdAt,
    }))
    .sort((left, right) => compareIsoDesc(left.at, right.at))

const buildRecentEventHighlights = (
  messages: ChatMessage[],
  eventName: 'manager_fallback_reply' | 'task_resumed',
  tone: ReviewStatusHighlight['tone'],
): ReviewStatusHighlight[] =>
  messages
    .filter((message) => isSystemEvent(message, eventName))
    .map((message) => ({
      id: `${eventName}-${message.id}`,
      title:
        eventName === 'manager_fallback_reply' ? 'Needs review' : 'Resumed',
      detail: message.text.trim(),
      tone,
      at: message.createdAt,
    }))
    .sort((left, right) => compareIsoDesc(left.at, right.at))

const buildPendingChoiceHighlight = (
  choice: PendingUserChoice | null | undefined,
): ReviewStatusHighlight[] => {
  if (!choice) return []
  return [
    {
      id: `pending-choice-${choice.id}`,
      title: 'Pending decision',
      detail: choice.question.trim(),
      tone: 'accent',
      at: choice.createdAt,
    },
  ]
}

const formatSummaryPart = (value: number, label: string): string | null =>
  value > 0 ? `${value} ${label}` : null

const buildSessionSummaryHighlight = (params: {
  doneCount: number
  recoverableCount: number
  failedCount: number
  needsReviewCount: number
  resumedCount: number
  at: string
}): ReviewStatusHighlight[] => {
  const parts = [
    formatSummaryPart(params.doneCount, 'done'),
    formatSummaryPart(params.recoverableCount, 'need resume'),
    formatSummaryPart(params.failedCount, 'failed'),
    formatSummaryPart(params.needsReviewCount, 'need review'),
    formatSummaryPart(params.resumedCount, 'resumed'),
  ].filter((item): item is string => Boolean(item))
  if (parts.length === 0) return []
  return [
    {
      id: 'session-summary',
      title: 'Session summary',
      detail: parts.join(' · '),
      tone: 'accent',
      at: params.at,
    },
  ]
}

export const buildReviewStatusView = (
  tasks: Task[],
  messages: ChatMessage[],
  pendingChoice?: PendingUserChoice | null,
): ReviewStatusView => {
  const doneCount = tasks.filter((task) => task.status === 'succeeded').length
  const recoverableCount = tasks.filter(isBudgetRecoverableTask).length
  const failedCount = tasks.filter((task) => task.status === 'failed').length
  const needsReviewCount =
    messages.filter((message) =>
      isSystemEvent(message, 'manager_fallback_reply'),
    ).length + (pendingChoice ? 1 : 0)
  const resumedCount = messages.filter((message) =>
    isSystemEvent(message, 'task_resumed'),
  ).length

  const detailHighlights = [
    ...buildPendingChoiceHighlight(pendingChoice),
    ...buildFailedHighlights(tasks),
    ...buildRecoverableHighlights(tasks),
    ...buildRecentEventHighlights(messages, 'manager_fallback_reply', 'accent'),
    ...buildRecentEventHighlights(messages, 'task_resumed', 'success'),
  ]
  const summaryAt = detailHighlights[0]?.at ?? new Date(0).toISOString()
  const highlights = [
    ...buildSessionSummaryHighlight({
      doneCount,
      recoverableCount,
      failedCount,
      needsReviewCount,
      resumedCount,
      at: summaryAt,
    }),
    ...detailHighlights.slice(0, Math.max(0, MAX_HIGHLIGHTS - 1)),
  ]

  return {
    cards: [
      { id: 'done', label: 'Done', value: doneCount, tone: 'success' },
      {
        id: 'recoverable',
        label: 'Need resume',
        value: recoverableCount,
        tone: 'warning',
      },
      {
        id: 'failed',
        label: 'Failed',
        value: failedCount,
        tone: 'accent',
      },
      {
        id: 'needs_input',
        label: 'Need review',
        value: needsReviewCount,
        tone: 'accent',
      },
      {
        id: 'resumed',
        label: 'Resumed',
        value: resumedCount,
        tone: 'neutral',
      },
    ],
    highlights,
  }
}
