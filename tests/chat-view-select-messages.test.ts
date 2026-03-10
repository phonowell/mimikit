import { expect, test } from 'vitest'

import { selectChatMessages } from '../src/orchestrator/read-model/chat-view.js'
import type { HistoryMessage, UserInput } from '../src/types/index.js'

test('selectChatMessages keeps delta continuity when inflight input arrives mid-stream', () => {
  const history: HistoryMessage[] = [
    {
      id: 'input-early',
      role: 'user',
      text: 'first',
      createdAt: '2026-03-02T08:00:00.000Z',
      focusId: 'focus-global',
    },
    {
      id: 'agent-late',
      role: 'agent',
      text: 'first reply',
      createdAt: '2026-03-02T08:00:10.000Z',
      focusId: 'focus-global',
    },
  ]
  const inflightInputs: UserInput[] = [
    {
      id: 'input-mid',
      role: 'user',
      text: 'interrupting input',
      createdAt: '2026-03-02T08:00:05.000Z',
      focusId: 'focus-global',
    },
  ]

  const selected = selectChatMessages({
    history,
    inflightInputs,
    limit: 50,
    afterId: 'input-mid',
  })

  expect(selected).toEqual({
    mode: 'delta',
    messages: [
      {
        id: 'agent-late',
        role: 'agent',
        text: 'first reply',
        createdAt: '2026-03-02T08:00:10.000Z',
        focusId: 'focus-global',
      },
    ],
  })
})

test('selectChatMessages keeps system text body without adding a label prefix', () => {
  const selected = selectChatMessages({
    history: [
      {
        id: 'sys-1',
        role: 'system',
        visibility: 'user',
        text: 'Session started.',
        systemEventName: 'startup',
        systemEventPayload: {},
        createdAt: '2026-03-02T08:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
    inflightInputs: [],
    limit: 50,
  })

  expect(selected).toEqual({
    mode: 'full',
    messages: [
      {
        id: 'sys-1',
        role: 'system',
        visibility: 'user',
        text: 'Session started.',
        createdAt: '2026-03-02T08:00:00.000Z',
        focusId: 'focus-global',
        systemEventName: 'startup',
        systemEventPayload: {},
      },
    ],
  })
})

test('selectChatMessages hides internal system events from user chat bubbles', () => {
  const selected = selectChatMessages({
    history: [
      {
        id: 'sys-internal-trigger',
        role: 'system',
        visibility: 'all',
        text: 'Task plan "nightly cleanup" was triggered.',
        systemEventName: 'trigger_fire',
        systemEventPayload: {
          plan_id: 'plan-1',
        },
        createdAt: '2026-03-02T08:00:00.000Z',
        focusId: 'focus-global',
      },
      {
        id: 'sys-internal-plan',
        role: 'system',
        visibility: 'user',
        text: 'Plan changed: "nightly cleanup" (updated).',
        systemEventName: 'plan_updated',
        systemEventPayload: {
          plan_id: 'plan-1',
        },
        createdAt: '2026-03-02T08:00:01.000Z',
        focusId: 'focus-global',
      },
    ],
    inflightInputs: [],
    limit: 50,
  })

  expect(selected).toEqual({
    mode: 'full',
    messages: [],
  })
})

test('selectChatMessages keeps user-facing system events with direct user value', () => {
  const selected = selectChatMessages({
    history: [
      {
        id: 'sys-choice',
        role: 'system',
        visibility: 'all',
        text: 'Selected option "Report".',
        systemEventName: 'user_choice',
        systemEventPayload: {
          source: 'user',
        },
        createdAt: '2026-03-02T08:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
    inflightInputs: [],
    limit: 50,
  })

  expect(selected).toEqual({
    mode: 'full',
    messages: [
      {
        id: 'sys-choice',
        role: 'system',
        visibility: 'all',
        text: 'Selected option "Report".',
        createdAt: '2026-03-02T08:00:00.000Z',
        focusId: 'focus-global',
        systemEventName: 'user_choice',
        systemEventPayload: {
          source: 'user',
        },
      },
    ],
  })
})
