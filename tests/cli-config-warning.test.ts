import { expect, test, vi } from 'vitest'

import {
  buildUnknownConfigKeysWarning,
  warnIgnoredUnknownConfigKeys,
} from '../src/cli/config-warning.js'

test('buildUnknownConfigKeysWarning contains sorted key list and ignore notice', () => {
  const message = buildUnknownConfigKeysWarning(['qq', 'manager.unknownManagerKey'])

  expect(message).toContain('detected unknown config keys')
  expect(message).toContain('manager.unknownManagerKey, qq')
  expect(message).toContain('ignored and do not block startup')
})

test('warnIgnoredUnknownConfigKeys emits warning through injected logger only when needed', () => {
  const warn = vi.fn<(message: string) => void>()

  warnIgnoredUnknownConfigKeys([], warn)
  expect(warn).not.toHaveBeenCalled()

  warnIgnoredUnknownConfigKeys(['qq'], warn)
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledWith(
    '[cli] detected unknown config keys: qq; they will be ignored and do not block startup',
  )
})
