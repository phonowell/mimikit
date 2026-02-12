import { expect, test } from 'vitest'

import {
  MAX_MANAGER_TIMEOUT_MS,
  MIN_MANAGER_TIMEOUT_MS,
  resolveManagerTimeoutMs,
} from '../src/manager/timeout.js'

test('manager timeout stays within 60s ~ 120s bounds', () => {
  expect(resolveManagerTimeoutMs('')).toBe(MIN_MANAGER_TIMEOUT_MS)
  expect(resolveManagerTimeoutMs('a'.repeat(120_000))).toBe(
    MAX_MANAGER_TIMEOUT_MS,
  )
})

test('manager timeout grows with prompt size', () => {
  const shortTimeout = resolveManagerTimeoutMs('a'.repeat(500))
  const mediumTimeout = resolveManagerTimeoutMs('a'.repeat(8_000))
  const largeTimeout = resolveManagerTimeoutMs('a'.repeat(20_000))

  expect(shortTimeout).toBeGreaterThanOrEqual(MIN_MANAGER_TIMEOUT_MS)
  expect(mediumTimeout).toBeGreaterThan(shortTimeout)
  expect(largeTimeout).toBeGreaterThan(mediumTimeout)
  expect(largeTimeout).toBeLessThanOrEqual(MAX_MANAGER_TIMEOUT_MS)
})

test('manager timeout uses utf8 byte size', () => {
  const asciiTimeout = resolveManagerTimeoutMs('a'.repeat(1_000))
  const unicodeTimeout = resolveManagerTimeoutMs('中'.repeat(1_000))
  expect(unicodeTimeout).toBeGreaterThan(asciiTimeout)
})
