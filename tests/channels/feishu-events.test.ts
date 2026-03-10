import { expect, test } from 'vitest'

import { toIsoFromUnixMillis } from '../../src/channels/feishu/events.js'

test('toIsoFromUnixMillis returns iso string for valid unix millis', () => {
  expect(toIsoFromUnixMillis('1741305600000')).toBe('2025-03-07T00:00:00.000Z')
})

test('toIsoFromUnixMillis returns undefined for overflow unix millis', () => {
  expect(toIsoFromUnixMillis('999999999999999999999')).toBeUndefined()
})
