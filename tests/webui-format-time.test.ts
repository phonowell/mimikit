import { expect, test } from 'vitest'

import { formatDisplayTime } from '../webui-src/lib/messages/format-time.js'

const formatForUtc = (input: string, now: string): string =>
  formatDisplayTime(input, {
    now,
    locale: 'en-US',
    timeZone: 'UTC',
  })

test('same-day timestamps stay on time-of-day formatting through the first five minutes', () => {
  const now = '2026-03-29T10:07:00.000Z'

  expect(formatForUtc('2026-03-29T10:03:00.000Z', now)).toBe('10:03')
  expect(formatForUtc('2026-03-29T10:02:00.000Z', now)).toBe('10:02')
})

test('same-day timestamps switch to relative minutes only after five minutes', () => {
  const now = '2026-03-29T10:07:00.000Z'

  expect(formatForUtc('2026-03-29T10:01:00.000Z', now)).toBe('6 min ago')
})
