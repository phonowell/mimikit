import { expect, test } from 'vitest'

import { shouldTriggerMemoryRefresh } from '../src/memory/refresh/trigger-policy.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

test('shouldTriggerMemoryRefresh returns false when turn gap met but no delta exists', async () => {
  const runtime = await createTestRuntimeState()
  runtime.manager.turn = 40
  runtime.manager.memoryRefresh.lastCompletedTurn = 20
  runtime.manager.memoryRefresh.signalVersion = 1
  runtime.manager.memoryRefresh.lastProcessedSignalVersion = 1

  expect(shouldTriggerMemoryRefresh(runtime)).toBe(false)
})

test('shouldTriggerMemoryRefresh returns true when turn gap met and delta exists', async () => {
  const runtime = await createTestRuntimeState()
  runtime.manager.turn = 40
  runtime.manager.memoryRefresh.lastCompletedTurn = 20
  runtime.manager.memoryRefresh.signalVersion = 2
  runtime.manager.memoryRefresh.lastProcessedSignalVersion = 1

  expect(shouldTriggerMemoryRefresh(runtime)).toBe(true)
})
