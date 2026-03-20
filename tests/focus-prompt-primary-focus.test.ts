import { expect, test } from 'vitest'

import { buildFocusPromptPayload } from '../src/focus/prompt.js'

test('buildFocusPromptPayload only keeps the primary focus in working focuses and recent history', () => {
  const payload = buildFocusPromptPayload({
    focuses: [
      {
        id: 'focus-a',
        title: 'Focus A',
        status: 'active',
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
        lastActivityAt: '2026-03-20T00:00:00.000Z',
      },
      {
        id: 'focus-b',
        title: 'Focus B',
        status: 'active',
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
        lastActivityAt: '2026-03-20T00:00:01.000Z',
      },
    ],
    history: [
      {
        id: 'msg-a-1',
        role: 'user',
        text: 'focus a message',
        createdAt: '2026-03-20T00:00:00.000Z',
        focusId: 'focus-a',
      },
      {
        id: 'msg-a-2',
        role: 'assistant',
        text: 'focus a reply',
        createdAt: '2026-03-20T00:00:01.000Z',
        focusId: 'focus-a',
      },
      {
        id: 'msg-b-1',
        role: 'user',
        text: 'focus b message',
        createdAt: '2026-03-20T00:00:02.000Z',
        focusId: 'focus-b',
      },
    ],
    workingFocusIds: ['focus-a', 'focus-b'],
  })

  expect(payload.workingFocuses).toHaveLength(1)
  expect(payload.workingFocuses[0]?.focusId).toBe('focus-a')
  expect(payload.workingFocuses[0]?.recentMessages.map((item) => item.id)).toEqual([
    'msg-a-2',
    'msg-a-1',
  ])
  expect(payload.recentHistory.map((item) => item.id)).not.toContain('msg-b-1')
})
