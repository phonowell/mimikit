import { expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../src/focus/index.js'
import { publishManagerSystemEventInput } from '../src/manager/system-input-event.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState()
  const now = new Date().toISOString()
  runtime.focuses.push({
    id: 'focus-topic',
    title: 'Topic',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
  })
  return runtime
}

test('publishManagerSystemEventInput defaults to global focus when focusId is omitted', async () => {
  const runtime = await createRuntime()

  await publishManagerSystemEventInput({
    runtime,
    summary: 'A worker slot was freed for new tasks.',
    event: 'worker_slot_freed',
    visibility: 'all',
    payload: {
      max_slots: 2,
      occupied_slots: 0,
      available_slots: 2,
      triggered_at: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    logEvent: 'worker_slot_freed_input',
  })

  expect(runtime.session.inflightInputs).toHaveLength(1)
  expect(runtime.session.inflightInputs[0]?.focusId).toBe(GLOBAL_FOCUS_ID)
})
