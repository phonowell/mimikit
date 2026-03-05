import { expect, test } from 'vitest'

import {
  ensureGlobalFocus,
  setFocusStatus,
  upsertFocusCompressedContext,
  upsertFocusContext,
} from '../src/focus/state.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const createRuntime = (): RuntimeState =>
  ({
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
    managerFocusCompressedContexts: [
      {
        focusId: 'focus-global',
        summary: 'legacy compressed',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    ],
    activeFocusIds: [],
  }) as unknown as RuntimeState

test('setFocusStatus normalizes global focus to active', () => {
  const runtime = createRuntime()

  setFocusStatus(runtime, 'focus-global', 'done')

  expect(runtime.focuses[0]?.status).toBe('active')
  expect(runtime.activeFocusIds).toContain('focus-global')
})

test('upsertFocusContext ignores global focus business context', () => {
  const runtime = createRuntime()

  upsertFocusContext(runtime, {
    focusId: 'focus-global',
    summary: 'new summary',
    openItems: ['next'],
  })

  expect(runtime.focusContexts).toHaveLength(0)
})

test('upsertFocusCompressedContext ignores global focus compressed context', () => {
  const runtime = createRuntime()

  upsertFocusCompressedContext(runtime, {
    focusId: 'focus-global',
    summary: 'new compressed',
  })

  expect(runtime.managerFocusCompressedContexts).toHaveLength(0)
})

test('ensureGlobalFocus cleans legacy global contexts', () => {
  const runtime = createRuntime()

  ensureGlobalFocus(runtime)

  expect(runtime.focusContexts).toHaveLength(0)
  expect(runtime.managerFocusCompressedContexts).toHaveLength(0)
  expect(runtime.activeFocusIds).toContain('focus-global')
  expect(runtime.focuses[0]?.status).toBe('active')
})
