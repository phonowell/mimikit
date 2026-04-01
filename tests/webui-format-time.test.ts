import { expect, test } from 'vitest'

import {
  formatDisplayTime,
  getDisplayTimeTickMs,
} from '../webui-src/lib/messages/format-time.js'

const formatForUtc = (input: string, now: string): string =>
  formatDisplayTime(input, {
    now,
    locale: 'en-US',
    timeZone: 'UTC',
  })

test('timestamps newer than one minute render as now instead of disappearing', () => {
  const now = '2026-03-29T10:07:00.000Z'

  expect(formatForUtc('2026-03-29T10:06:31.000Z', now)).toBe('now')
})

test('same-day timestamps stay on relative minutes formatting through the first hour', () => {
  const now = '2026-03-29T10:07:00.000Z'

  expect(formatForUtc('2026-03-29T10:03:00.000Z', now)).toBe('4 min ago')
  expect(formatForUtc('2026-03-29T09:08:00.000Z', now)).toBe('59 min ago')
})

test('same-day timestamps older than one hour switch back to compact absolute time', () => {
  const now = '2026-03-29T10:07:00.000Z'

  expect(formatForUtc('2026-03-29T09:07:00.000Z', now)).toBe('09:07')
})

test('recent timestamps request second-level refresh only during the now window', () => {
  const now = '2026-03-29T10:07:00.000Z'

  expect(getDisplayTimeTickMs('2026-03-29T10:06:31.000Z', { now })).toBe(1_000)
  expect(getDisplayTimeTickMs('2026-03-29T10:05:00.000Z', { now })).toBe(60_000)
})
