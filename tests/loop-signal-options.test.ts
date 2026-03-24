import { expect, test } from 'vitest'

import {
  notifyManagerLoop,
  notifyWorkerLoop,
} from '../src/kernel/orchestrator/signals.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

test('notifyManagerLoop can skip ui wake emission', async () => {
  const runtime = await createTestRuntimeState()

  notifyManagerLoop(runtime, { notifyUi: false })

  expect(runtime.manager.wakePending).toBe(true)
  expect(runtime.ui.wakeVersion).toBe(0)
  expect(runtime.ui.wakeEvents.size).toBe(0)
})

test('notifyWorkerLoop can emit explicit ui wake kind', async () => {
  const runtime = await createTestRuntimeState()

  notifyWorkerLoop(runtime, { uiKind: 'tasks' })

  expect(runtime.ui.wakeVersion).toBe(1)
  expect(runtime.ui.wakeEvents.get(1)).toBe('tasks')
})
