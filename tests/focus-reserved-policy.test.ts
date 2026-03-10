import { expect, test } from 'vitest'

import { ensureGlobalFocus, setFocusStatus } from '../src/focus/state.js'
import { upsertFocusDigest } from '../src/focus/state-digest.js'
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
      focusDigests: [
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

test('upsertFocusDigest ignores global focus business context', async () => {
  const runtime = await createRuntime()

  upsertFocusDigest(runtime, {
    focusId: 'focus-global',
    summary: 'new summary',
    openItems: ['next'],
  })

  expect(runtime.focusDigests).toHaveLength(0)
})

test('ensureGlobalFocus cleans legacy global focus digests', async () => {
  const runtime = await createRuntime()

  ensureGlobalFocus(runtime)

  expect(runtime.focusDigests).toHaveLength(0)
  expect(runtime.focuses[0]?.status).toBe('active')
})
