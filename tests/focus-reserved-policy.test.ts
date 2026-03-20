import { expect, test } from 'vitest'

import { ensureGlobalFocus, updateFocus, setFocusStatus } from '../src/focus/state.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const createRuntime = async (): Promise<RuntimeState> =>
  createTestRuntimeState({
    patch: {
      focuses: [
        {
          id: 'focus-global',
          title: 'Global',
          status: 'idle',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
          lastActivityAt: '2026-03-01T00:00:00.000Z',
          summary: 'legacy summary',
        },
      ],
    },
  })

test('setFocusStatus normalizes global focus to active', async () => {
  const runtime = await createRuntime()

  setFocusStatus(runtime, 'focus-global', 'done')

  expect(runtime.focuses[0]?.status).toBe('active')
})

test('updateFocus ignores global focus business context', async () => {
  const runtime = await createRuntime()

  updateFocus(runtime, {
    id: 'focus-global',
    summary: 'new summary',
    openItems: ['next'],
  })

  expect(runtime.focuses[0]?.summary).toBeUndefined()
  expect(runtime.focuses[0]?.openItems).toBeUndefined()
})

test('updateFocus normalizes global focus status through shared status path', async () => {
  const runtime = await createRuntime()

  updateFocus(runtime, {
    id: 'focus-global',
    status: 'done',
  })

  expect(runtime.focuses[0]?.status).toBe('active')
})

test('ensureGlobalFocus cleans legacy global focus details', async () => {
  const runtime = await createRuntime()

  ensureGlobalFocus(runtime)

  expect(runtime.focuses[0]?.summary).toBeUndefined()
  expect(runtime.focuses[0]?.openItems).toBeUndefined()
  expect(runtime.focuses[0]?.status).toBe('active')
})
