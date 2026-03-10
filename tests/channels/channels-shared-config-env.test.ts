import { expect, test, vi } from 'vitest'

import {
  applyTrimmedEnv,
  parseChannelEnabledEnv,
} from '../../src/channels/shared/config-env.js'

test('parseChannelEnabledEnv supports true/false variants', () => {
  expect(parseChannelEnabledEnv({ value: 'true', envName: 'X' })).toBe(true)
  expect(parseChannelEnabledEnv({ value: 'YES', envName: 'X' })).toBe(true)
  expect(parseChannelEnabledEnv({ value: '1', envName: 'X' })).toBe(true)
  expect(parseChannelEnabledEnv({ value: 'false', envName: 'X' })).toBe(false)
  expect(parseChannelEnabledEnv({ value: 'No', envName: 'X' })).toBe(false)
  expect(parseChannelEnabledEnv({ value: '0', envName: 'X' })).toBe(false)
})

test('parseChannelEnabledEnv warns and returns undefined for invalid value', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const parsed = parseChannelEnabledEnv({ value: 'invalid', envName: 'X_ENV' })
  expect(parsed).toBeUndefined()
  expect(warn).toHaveBeenCalledWith('[cli] invalid X_ENV:', 'invalid')
  warn.mockRestore()
})

test('applyTrimmedEnv assigns only non-empty trimmed values', () => {
  let target = 'initial'
  applyTrimmedEnv({
    value: '   ',
    assign: (next) => {
      target = next
    },
  })
  expect(target).toBe('initial')

  applyTrimmedEnv({
    value: '  next-value  ',
    assign: (next) => {
      target = next
    },
  })
  expect(target).toBe('next-value')
})
