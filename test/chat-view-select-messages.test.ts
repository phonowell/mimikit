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

test('selectChatMessages normalizes system text to canonical system bubble format', () => {
  const selected = selectChatMessages({
    history: [
      {
        id: 'sys-1',
        role: 'system',
        visibility: 'user',
        text: 'Session started.\n\n<M:system_event name="startup" version="1">{}</M:system_event>',
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
        text: 'System: Session started.',
        createdAt: '2026-03-02T08:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
  })
})

test('selectChatMessages avoids double system prefix on system text', () => {
  const selected = selectChatMessages({
    history: [
      {
        id: 'sys-2',
        role: 'system',
        visibility: 'user',
        text: 'System: Message deleted.',
        createdAt: '2026-03-02T08:00:01.000Z',
        focusId: 'focus-global',
      },
    ],
    inflightInputs: [],
    limit: 50,
  })

  expect(selected.messages[0]?.text).toBe('System: Message deleted.')
})
