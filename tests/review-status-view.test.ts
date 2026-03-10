import { expect, test } from 'vitest'

import { buildReviewStatusView } from '../src/orchestrator/read-model/review-status-view.js'
import type { ChatMessage } from '../src/orchestrator/read-model/chat-view.js'
import type { Task } from '../src/types/index.js'

const createTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  fingerprint: 'fp-task-1',
  prompt: 'run task',
  title: 'Run Task',
  focusId: 'focus-global',
  profile: 'worker',
  provider: 'codex',
  status: 'pending',
  createdAt: '2026-03-10T00:00:00.000Z',
  ...overrides,
})

const createMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'msg-1',
  role: 'system',
  visibility: 'user',
  text: 'system event',
  createdAt: '2026-03-10T00:00:00.000Z',
  focusId: 'focus-global',
  ...overrides,
})

test('buildReviewStatusView summarizes done, recoverable, input-needed, and resumed work', () => {
  const tasks: Task[] = [
    createTask({
      id: 'task-done',
      title: 'Done Task',
      status: 'succeeded',
      completedAt: '2026-03-10T00:04:00.000Z',
    }),
    createTask({
      id: 'task-recoverable',
      title: 'Budget Task',
      status: 'paused',
      pausedAt: '2026-03-10T00:05:00.000Z',
      result: {
        taskId: 'task-recoverable',
        status: 'partial',
        taskStatus: 'paused',
        outcome: 'partial',
        stopReason: 'budget_exhausted',
        ok: false,
        output: 'partial output',
        durationMs: 10,
        completedAt: '2026-03-10T00:05:00.000Z',
        handoff: {
          summary: 'Continue from the saved partial result.',
        },
      },
    }),
    createTask({
      id: 'task-failed',
      title: 'Failed Task',
      status: 'failed',
      completedAt: '2026-03-10T00:05:30.000Z',
      result: {
        taskId: 'task-failed',
        status: 'failed',
        taskStatus: 'failed',
        outcome: 'blocked',
        stopReason: 'failed',
        ok: false,
        output: 'Build step crashed on missing artifact.',
        durationMs: 10,
        completedAt: '2026-03-10T00:05:30.000Z',
      },
    }),
  ]
  const messages: ChatMessage[] = [
    createMessage({
      id: 'msg-needs-input',
      text: 'Need more files to continue.',
      createdAt: '2026-03-10T00:06:00.000Z',
      systemEventName: 'manager_fallback_reply',
    }),
    createMessage({
      id: 'msg-resumed',
      text: 'Resumed task "Budget Task".',
      createdAt: '2026-03-10T00:07:00.000Z',
      systemEventName: 'task_resumed',
    }),
  ]

  const view = buildReviewStatusView(tasks, messages, {
    id: 'choice-review',
    question: 'Review whether to run the high-cost task now or narrow it first.',
    options: [
      { id: 'option-run', label: 'Run now', reason: 'Execute current scope' },
      {
        id: 'option-narrow',
        label: 'Narrow first',
        reason: 'Review before dispatch',
      },
    ],
    defaultOptionId: 'option-narrow',
    createdAt: '2026-03-10T00:08:00.000Z',
    focusId: 'focus-global',
  })
  const cardValues = new Map(view.cards.map((item) => [item.id, item.value]))

  expect(cardValues.get('done')).toBe(1)
  expect(cardValues.get('recoverable')).toBe(1)
  expect(cardValues.get('failed')).toBe(1)
  expect(cardValues.get('needs_input')).toBe(2)
  expect(cardValues.get('resumed')).toBe(1)
  expect(view.highlights).toEqual([
    {
      id: 'session-summary',
      title: 'Session summary',
      detail: '1 done · 1 need resume · 1 failed · 2 need review · 1 resumed',
      tone: 'accent',
      at: '2026-03-10T00:08:00.000Z',
    },
    {
      id: 'pending-choice-choice-review',
      title: 'Pending decision',
      detail: 'Review whether to run the high-cost task now or narrow it first.',
      tone: 'accent',
      at: '2026-03-10T00:08:00.000Z',
    },
    {
      id: 'failed-task-failed',
      title: 'Failed Task',
      detail: 'Build step crashed on missing artifact.',
      tone: 'accent',
      at: '2026-03-10T00:05:30.000Z',
    },
    {
      id: 'recoverable-task-recoverable',
      title: 'Budget Task',
      detail: 'Continue from the saved partial result.',
      tone: 'warning',
      at: '2026-03-10T00:05:00.000Z',
    },
  ])
})
