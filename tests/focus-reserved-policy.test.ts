import { expect, test } from 'vitest'

import { ensureGlobalFocus, setFocusStatus } from '../src/focus/state.js'
import { upsertFocusContext } from '../src/focus/state-context.js'
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
        },
      ],
      focusContexts: [
        {
          focusId: 'focus-global',
          summary: 'legacy summary',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
      ],
    },
  })

test('setFocusStatus normalizes global focus to active', async () => {
  const runtime = await createRuntime()

  setFocusStatus(runtime, 'focus-global', 'done')

  expect(runtime.focuses[0]?.status).toBe('active')
})

test('upsertFocusContext ignores global focus business context', async () => {
  const runtime = await createRuntime()

  upsertFocusContext(runtime, {
    focusId: 'focus-global',
    summary: 'new summary',
    openItems: ['next'],
  })

  expect(runtime.focusContexts).toHaveLength(0)
})

test('ensureGlobalFocus cleans legacy global focus contexts', async () => {
  const runtime = await createRuntime()

  ensureGlobalFocus(runtime)

  expect(runtime.focusContexts).toHaveLength(0)
  expect(runtime.focuses[0]?.status).toBe('active')
})
