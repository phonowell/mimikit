import { expect, test } from 'vitest'

import { selectChatMessages } from '../src/orchestrator/read-model/chat-view.js'

test('selectChatMessages preserves system event metadata for manager fallback', () => {
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
        text: 'Service unavailable. Try again soon.',
        systemEventName: 'manager_fallback_reply',
        systemEventPayload: {
          reply: 'Service unavailable. Try again soon.',
          source_input_id: 'input-1',
          auto_retry_attempts: 0,
          auto_retry_max_attempts: 1,
          auto_retry_state: 'exhausted',
          auto_retry_strategy: 'manager_single_attempt',
        },
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

test('selectChatMessages preserves structured metadata for visible inflight system inputs without parsing tags', () => {
  const result = selectChatMessages({
    history: [],
    inflightInputs: [
      {
        id: 'sys-input-1',
        role: 'system',
        visibility: 'all',
        text: 'Selected option "Report".',
        systemEventName: 'user_choice',
        systemEventPayload: {
          choice_id: 'choice-report',
          selected_option_id: 'option-report',
          source: 'timeout',
        },
        createdAt: '2026-03-06T00:00:01.000Z',
        focusId: 'focus-main',
      },
    ],
    limit: 10,
  })

  expect(result.mode).toBe('full')
  expect(result.messages).toHaveLength(1)
  expect(result.messages[0]).toMatchObject({
    role: 'system',
    text: 'Selected option "Report".',
    systemEventName: 'user_choice',
    systemEventPayload: {
      choice_id: 'choice-report',
      selected_option_id: 'option-report',
      source: 'timeout',
    },
  })
})
