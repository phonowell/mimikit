import { expect, test } from 'vitest'

import {
  assertBackgroundWriteAllowed,
  getBackgroundJobSpec,
  listBackgroundJobSpecs,
} from '../src/orchestrator/background-write-policy.js'

test('memory_refresh allows writes to memory and runtime_meta only', () => {
  expect(() =>
    assertBackgroundWriteAllowed('memory_refresh', 'memory'),
  ).not.toThrow()
  expect(() =>
    assertBackgroundWriteAllowed('memory_refresh', 'runtime_meta'),
  ).not.toThrow()
  expect(() =>
    assertBackgroundWriteAllowed(
      'memory_refresh',
      'task' as never,
    ),
  ).toThrowError('background_write_forbidden:memory_refresh:task')
})

test('background jobs are declared through the shared registry', () => {
  expect(listBackgroundJobSpecs()).toEqual([
    expect.objectContaining({
      source: 'memory_refresh',
      allowedWriteDomains: ['memory', 'runtime_meta'],
      auditEvents: {
        requested: 'memory_refresh_requested',
        started: 'memory_refresh_started',
        succeeded: 'memory_refresh_succeeded',
        failed: 'memory_refresh_failed',
      },
    }),
  ])
  expect(getBackgroundJobSpec('memory_refresh').summary).toContain(
    'stable structured memory signals',
  )
})
