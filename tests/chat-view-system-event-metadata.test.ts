import { expect, test } from 'vitest'

import { selectChatMessages } from '../src/orchestrator/read-model/chat-view.js'
import { formatSystemEventText } from '../src/shared/system-event.js'

test('selectChatMessages preserves system event metadata for manager fallback', () => {
  const fallbackText = formatSystemEventText({
    summary: 'Service unavailable. Try again soon.',
    event: 'manager_fallback_reply',
    payload: {
      reply: 'Service unavailable. Try again soon.',
      source_input_id: 'input-1',
      auto_retry_attempts: 0,
      auto_retry_max_attempts: 1,
      auto_retry_state: 'exhausted',
      auto_retry_strategy: 'manager_single_attempt',
    },
  })

  const result = selectChatMessages({
    history: [
      {
        id: 'input-1',
        role: 'user',
        text: 'hello',
        createdAt: '2026-03-06T00:00:00.000Z',
        focusId: 'focus-main',
      },
      {
        id: 'sys-1',
        role: 'system',
        visibility: 'user',
        text: fallbackText,
        createdAt: '2026-03-06T00:00:01.000Z',
        focusId: 'focus-main',
      },
    ],
    inflightInputs: [],
    limit: 10,
  })

  expect(result.mode).toBe('full')
  expect(result.messages).toHaveLength(2)
  const fallback = result.messages[1]
  expect(fallback?.role).toBe('system')
  expect(fallback?.text).toBe('Service unavailable. Try again soon.')
  expect(fallback?.systemEventName).toBe('manager_fallback_reply')
  expect(fallback?.systemEventPayload).toMatchObject({
    source_input_id: 'input-1',
    auto_retry_attempts: 0,
    auto_retry_state: 'exhausted',
  })
})
