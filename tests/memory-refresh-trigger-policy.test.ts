import { expect, test } from 'vitest'

import { shouldTriggerMemoryRefresh } from '../src/memory/refresh/trigger-policy.js'
import { createQueryContextRuntime } from './helpers/query-context-runtime.js'

test('shouldTriggerMemoryRefresh returns false when turn gap met but no delta exists', async () => {
  const runtime = await createQueryContextRuntime()
  runtime.manager.turn = 40
  runtime.manager.memoryRefresh.lastCompletedTurn = 20
  runtime.manager.memoryRefresh.lastProcessedInputsCursor = runtime.queues.inputsCursor

  expect(shouldTriggerMemoryRefresh(runtime)).toBe(false)
})

test('shouldTriggerMemoryRefresh returns true when turn gap met and delta exists', async () => {
  const runtime = await createQueryContextRuntime()
  runtime.manager.turn = 40
  runtime.manager.memoryRefresh.lastCompletedTurn = 20
  runtime.manager.memoryRefresh.lastProcessedInputsCursor = runtime.queues.inputsCursor
  runtime.queues.inputsCursor += 1

  expect(shouldTriggerMemoryRefresh(runtime)).toBe(true)
})
