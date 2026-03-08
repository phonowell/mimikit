import { expect, test } from 'vitest'

import { isTelegramPollingConflictError } from '../src/orchestrator/core/orchestrator-service.js'

test('detects telegram polling 409 conflict error message', () => {
  expect(
    isTelegramPollingConflictError(
      'telegram_polling_start_failed:409: Conflict: terminated by other getUpdates request; make sure that only one bot instance is running',
    ),
  ).toBe(true)
})

test('returns false for non-conflict startup errors', () => {
  expect(
    isTelegramPollingConflictError(
      'telegram_polling_start_failed:401: Unauthorized',
    ),
  ).toBe(false)
})

