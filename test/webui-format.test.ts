import { expect, test } from 'vitest'

import { formatUsage } from '../src/webui/messages/format.js'

test('formatUsage keeps k for thousands', () => {
  expect(formatUsage({ input: 9500, output: 1500 })).toBe('↑ 9.5k · ↓ 1.5k')
})

test('formatUsage uses M and B for larger values', () => {
  expect(formatUsage({ input: 1_250_000, output: 2_500_000_000 })).toBe(
    '↑ 1.3M · ↓ 2.5B',
  )
})

test('formatUsage normalizes boundary rounding to next suffix', () => {
  expect(formatUsage({ input: 999_950 })).toBe('↑ 1M')
})
