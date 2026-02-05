import { expect, test } from 'vitest'

import { formatStatusText } from '../src/webui/status.js'

test('formatStatusText uppercases status labels', () => {
  expect(formatStatusText('idle')).toBe('IDLE')
  expect(formatStatusText('resetting...')).toBe('RESETTING...')
})

test('formatStatusText handles empty values', () => {
  expect(formatStatusText('')).toBe('')
  expect(formatStatusText(null)).toBe('')
})
