import { expect, test } from 'vitest'

import { notifyUiSignal, waitForUiSignal } from '../src/orchestrator/core/signals.js'
import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const createRuntime = (): RuntimeState =>
  ({
    ui: {
      wakeVersion: 0,
      wakeEvents: new Map(),
      signalControllers: new Set(),
      pendingUserChoice: null,
    },
    manager: {
      wakePending: false,
      signalController: new AbortController(),
    },
    worker: {
      signalController: new AbortController(),
    },
  }) as unknown as RuntimeState

test('waitForUiSignal wakes all concurrent listeners', async () => {
  const runtime = createRuntime()
  const wait1 = waitForUiSignal(runtime, 1000, 0)
  const wait2 = waitForUiSignal(runtime, 1000, 0)
  await Promise.resolve()
  notifyUiSignal(runtime, 'messages')
  await expect(wait1).resolves.toEqual({ kind: 'messages', version: 1 })
  await expect(wait2).resolves.toEqual({ kind: 'messages', version: 1 })
})

test('waitForUiSignal consumes unseen versions in order', async () => {
  const runtime = createRuntime()
  notifyUiSignal(runtime, 'snapshot')
  notifyUiSignal(runtime, 'tasks')
  notifyUiSignal(runtime, 'messages')
  await expect(waitForUiSignal(runtime, 1, 0)).resolves.toEqual({
    kind: 'snapshot',
    version: 1,
  })
  await expect(waitForUiSignal(runtime, 1, 1)).resolves.toEqual({
    kind: 'tasks',
    version: 2,
  })
  await expect(waitForUiSignal(runtime, 1, 2)).resolves.toEqual({
    kind: 'messages',
    version: 3,
  })
})
