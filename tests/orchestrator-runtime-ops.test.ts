import { expect, test } from 'vitest'

import { INBOX_FOCUS_ID } from '../src/focus/constants.js'
import { appendUserInput } from '../src/orchestrator/core/orchestrator-input-ingress.js'
import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import { consumeUserInputs } from '../src/streams/queues.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

const GLOBAL_FOCUS_ID = 'focus-global'

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  const now = new Date().toISOString()
  runtime.focuses.push({
    id: 'focus-choice',
    title: 'Choice',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
  })
  runtime.ui.pendingUserChoice = {
    id: 'choice-delivery',
    question: 'Choose output format',
    options: [
      {
        id: 'option-report',
        label: 'Report',
        reason: 'Need details',
      },
      {
        id: 'option-checklist',
        label: 'Checklist',
        reason: 'Need speed',
      },
    ],
    defaultOptionId: 'option-report',
    createdAt: '2026-03-01T00:00:00.000Z',
    expiresAt: '2026-03-01T00:05:00.000Z',
    focusId: 'focus-choice',
  }
  return runtime
}

test('appendUserInput cancels pending user choice when user sends a new message', async () => {
  const runtime = await createRuntime()

  await appendUserInput(runtime, 'continue with a different request')

  expect(runtime.ui.pendingUserChoice).toBeNull()
  expect(runtime.session.inflightInputs).toHaveLength(2)
  const packets = await consumeUserInputs({
    paths: runtime.paths,
    fromCursor: 0,
  })
  expect(packets).toHaveLength(2)
  const first = packets[0]?.payload
  const second = packets[1]?.payload
  expect(first).toMatchObject({
    role: 'user',
    text: 'continue with a different request',
  })
  expect(second).toMatchObject({
    role: 'system',
    visibility: 'all',
    focusId: 'focus-choice',
    systemEventName: 'user_choice_skipped',
    systemEventPayload: {
      choice_id: 'choice-delivery',
    },
  })
  if (second?.role !== 'system') return
  expect(second.text).toContain('Choose output format')
})

test('appendUserInput falls back to inbox focus when only global focus exists', async () => {
  const runtime = await createRuntime()
  runtime.focuses = runtime.focuses.filter((item) => item.id === GLOBAL_FOCUS_ID)
  runtime.ui.pendingUserChoice = null

  await appendUserInput(runtime, 'start a new track')

  expect(runtime.session.inflightInputs).toHaveLength(1)
  const first = runtime.session.inflightInputs[0]
  expect(first?.role).toBe('user')
  expect(first?.focusId).toBe(INBOX_FOCUS_ID)
})
