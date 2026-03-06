import { expect, test } from 'vitest'

import {
  formatManagerFallbackRetryHint,
  isManagerFallbackMessage,
  readManagerFallbackRetryStats,
  resolveManagerFallbackRetrySource,
  shouldShowManagerFallbackRetry,
} from '../webui/messages/fallback-retry.js'

test('fallback retry resolves source input by payload id', () => {
  const messages = [
    {
      id: 'input-1',
      role: 'user',
      text: 'retry target',
    },
    {
      id: 'sys-1',
      role: 'system',
      text: 'Service unavailable. Try again soon.',
      systemEventName: 'manager_fallback_reply',
      systemEventPayload: {
        source_input_id: 'input-1',
        auto_retry_attempts: 2,
        auto_retry_max_attempts: 3,
        auto_retry_state: 'exhausted',
        auto_retry_strategy: 'manager_single_attempt',
      },
    },
  ]

  const fallback = messages[1]
  const source = resolveManagerFallbackRetrySource(messages, fallback)
  expect(isManagerFallbackMessage(fallback)).toBe(true)
  expect(shouldShowManagerFallbackRetry(fallback)).toBe(true)
  expect(source).toEqual({ inputId: 'input-1', text: 'retry target' })
  expect(readManagerFallbackRetryStats(fallback)).toEqual({
    attempts: 2,
    maxAttempts: 3,
    state: 'exhausted',
    strategy: 'manager_single_attempt',
  })
  expect(formatManagerFallbackRetryHint(fallback)).toContain('Auto-retried 2 times')
})

test('fallback retry hidden for unrelated system events', () => {
  const message = {
    id: 'sys-2',
    role: 'system',
    text: 'internal',
    systemEventName: 'manager_error',
    systemEventPayload: { auto_retry_state: 'exhausted' },
  }

  expect(isManagerFallbackMessage(message)).toBe(false)
  expect(shouldShowManagerFallbackRetry(message)).toBe(false)
  expect(resolveManagerFallbackRetrySource([], message)).toBeNull()
  expect(formatManagerFallbackRetryHint(message)).toBe('')
})
