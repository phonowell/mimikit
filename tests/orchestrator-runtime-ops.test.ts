import { expect, test } from 'vitest'

import { appendUserInput } from '../src/surface/orchestrator/orchestrator-input-ingress.js'
import { INBOX_FOCUS_ID } from '../src/work/focus/constants.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'

const GLOBAL_FOCUS_ID = 'focus-global'

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  const now = new Date().toISOString()
  runtime.domain.focuses.push({
    id: 'focus-choice',
    title: 'Choice',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
  })
  return runtime
}

test('appendUserInput falls back to inbox focus when only global focus exists', async () => {
  const runtime = await createRuntime()
  runtime.domain.focuses = runtime.domain.focuses.filter(
    (item) => item.id === GLOBAL_FOCUS_ID,
  )

  await appendUserInput(runtime, 'start a new track')

  expect(runtime.process.session.inflightInputs).toHaveLength(1)
  const first = runtime.process.session.inflightInputs[0]
  expect(first?.role).toBe('user')
  expect(first?.focusId).toBe(INBOX_FOCUS_ID)
})
