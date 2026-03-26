import { expect, test } from 'vitest'

import { formatUsage } from '../webui-src/lib/messages/format-usage.js'

test('formatUsage keeps cached input out of the displayed input total', () => {
  const usage = formatUsage({
    input: 1000,
    inputCacheRead: 250,
    inputCacheWrite: 125,
    output: 2000,
    total: 3000,
  })

  expect(usage).toEqual({
    text: '↑ 1k · ↓ 2k',
    title:
      'Input total tokens: 1k\n' +
      'Input tokens: 1k\n' +
      'Input cache read tokens: 250\n' +
      'Input cache write tokens: 125\n' +
      'Output total tokens: 2k\n' +
      'Output tokens: 2k\n' +
      'Output cache tokens: 0\n' +
      'Total tokens: 3,000',
  })
})

test('formatUsage still displays cache-only input usage details', () => {
  const usage = formatUsage({
    inputCacheRead: 250,
    inputCacheWrite: 125,
  })

  expect(usage).toEqual({
    text: '↑ 375',
    title:
      'Input total tokens: 375\n' +
      'Input tokens: 0\n' +
      'Input cache read tokens: 250\n' +
      'Input cache write tokens: 125',
  })
})
