import { expect, test } from 'vitest'

import { sandboxModeFor } from '../src/execution/providers/codex-sdk-provider-helpers.js'

test('sandboxModeFor keeps worker write tasks in danger-full-access', () => {
  expect(
    sandboxModeFor({
      role: 'worker',
      resourceMode: 'write',
    }),
  ).toBe('danger-full-access')
})

test('sandboxModeFor lowers worker read tasks to read-only', () => {
  expect(
    sandboxModeFor({
      role: 'worker',
      resourceMode: 'read',
    }),
  ).toBe('read-only')
  expect(
    sandboxModeFor({
      role: 'manager',
    }),
  ).toBe('read-only')
})
