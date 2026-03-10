import {
  isBudgetRecoverableTask,
  resolveTaskLabel,
} from '../../shared/task-state.js'
import { compareIsoDesc } from '../../shared/time.js'

import type { ChatMessage } from './chat-view.js'
import type { Task } from '../../types/index.js'

export type DutyStatusCard = {
  id: 'done' | 'recoverable' | 'needs_input' | 'resumed'
  label: string
  value: number
  tone: 'success' | 'warning' | 'accent' | 'neutral'
}

export type DutyStatusHighlight = {
  id: string
  title: string
  detail: string
  tone: 'success' | 'warning' | 'accent'
  at: string
}

export type DutyStatusView = {
  cards: DutyStatusCard[]
  highlights: DutyStatusHighlight[]
}

const MAX_HIGHLIGHTS = 4

const isSystemEvent = (message: ChatMessage, name: string): boolean =>
  message.role === 'system' && message.systemEventName === name

const buildRecoverableHighlights = (tasks: Task[]): DutyStatusHighlight[] =>
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

const buildRecentEventHighlights = (
  messages: ChatMessage[],
  eventName: 'manager_fallback_reply' | 'task_resumed',
  tone: DutyStatusHighlight['tone'],
): DutyStatusHighlight[] =>
  messages
    .filter((message) => isSystemEvent(message, eventName))
    .map((message) => ({
      id: `${eventName}-${message.id}`,
      title: eventName === 'manager_fallback_reply' ? 'Needs input' : 'Resumed',
      detail: message.text.trim(),
      tone,
      at: message.createdAt,
    }))
    .sort((left, right) => compareIsoDesc(left.at, right.at))

export const buildDutyStatusView = (
  tasks: Task[],
  messages: ChatMessage[],
): DutyStatusView => {
  const doneCount = tasks.filter((task) => task.status === 'succeeded').length
  const recoverableCount = tasks.filter(isBudgetRecoverableTask).length
  const needsInputCount = messages.filter((message) =>
    isSystemEvent(message, 'manager_fallback_reply'),
  ).length
  const resumedCount = messages.filter((message) =>
    isSystemEvent(message, 'task_resumed'),
  ).length

  const highlights = [
    ...buildRecoverableHighlights(tasks),
    ...buildRecentEventHighlights(messages, 'manager_fallback_reply', 'accent'),
    ...buildRecentEventHighlights(messages, 'task_resumed', 'success'),
  ]
    .sort((left, right) => compareIsoDesc(left.at, right.at))
    .slice(0, MAX_HIGHLIGHTS)

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
        id: 'needs_input',
        label: 'Need input',
        value: needsInputCount,
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
