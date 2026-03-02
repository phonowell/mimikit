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
