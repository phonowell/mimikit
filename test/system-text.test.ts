import { expect, test } from 'vitest'

import { formatSystemBubbleText, formatUiError } from '../webui/system-text.js'

test('formatSystemBubbleText applies canonical system prefix once', () => {
  expect(formatSystemBubbleText('Session started.')).toBe('System: Session started.')
  expect(formatSystemBubbleText('System: Session started.')).toBe(
    'System: Session started.',
  )
})

test('formatUiError uses canonical system bubble format', () => {
  expect(formatUiError('network timeout')).toBe('System: Error: network timeout')
})
