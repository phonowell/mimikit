import { expect, test } from 'vitest'

import { appendHistory } from '../src/persistence/history/store.js'
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

test('appendUserInput inherits quoted message provenance into runtime input state', async () => {
  const runtime = await createRuntime()
  const quotedCreatedAt = new Date().toISOString()
  await appendHistory(runtime.paths.history, {
    id: 'sys-quoted-task',
    role: 'system',
    visibility: 'user',
    text: 'Task "quoted" completed successfully.',
    createdAt: quotedCreatedAt,
    focusId: 'focus-choice',
    systemEventName: 'task_completed',
    systemEventPayload: {
      task_id: 'task-quoted',
      plan_id: 'plan-quoted',
      source_input_id: 'input-origin',
    },
  })

  await appendUserInput(
    runtime,
    '不是这一条任务，要修正上面的规则',
    undefined,
    'sys-quoted-task',
  )

  const first = runtime.process.session.inflightInputs[0]
  expect(first).toMatchObject({
    role: 'user',
    focusId: 'focus-choice',
    quote: 'sys-quoted-task',
    sourceInputIds: ['input-origin'],
    sourceTaskIds: ['task-quoted'],
    sourcePlanIds: ['plan-quoted'],
  })
})
