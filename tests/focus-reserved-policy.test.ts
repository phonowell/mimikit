import { expect, test } from 'vitest'

import {
  ensureGlobalFocus,
  setFocusStatus,
  updateFocus,
} from '../src/work/focus/state.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'

const createRuntime = (): Promise<RuntimeState> =>
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

test('updateFocus digest-only edits do not refresh lastActivityAt', async () => {
  const runtime = await createTestRuntimeState({
    patch: {
      focuses: [
        {
          id: 'focus-local',
          title: 'Local',
          status: 'active',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
          lastActivityAt: '2026-03-01T00:00:05.000Z',
        },
      ],
    },
  })

  updateFocus(runtime, {
    id: 'focus-local',
    summary: 'Updated digest',
    openItems: ['Next step'],
  })

  const focus = runtime.focuses[0]
  expect(focus?.summary).toBe('Updated digest')
  expect(focus?.openItems).toEqual(['Next step'])
  expect(focus?.lastActivityAt).toBe('2026-03-01T00:00:05.000Z')
  expect(focus?.updatedAt).not.toBe('2026-03-01T00:00:00.000Z')
})

test('focus metadata edits no longer emit webui wake signals', async () => {
  const runtime = await createTestRuntimeState({
    patch: {
      focuses: [
        {
          id: 'focus-local',
          title: 'Local',
          status: 'active',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
          lastActivityAt: '2026-03-01T00:00:05.000Z',
        },
      ],
    },
  })

  updateFocus(runtime, {
    id: 'focus-local',
    summary: 'Updated digest',
  })
  setFocusStatus(runtime, 'focus-local', 'archived')

  expect(runtime.ui.wakeVersion).toBe(0)
  expect(runtime.ui.wakeEvents.size).toBe(0)
})

test('ensureGlobalFocus cleans legacy global focus details', async () => {
  const runtime = await createRuntime()

  ensureGlobalFocus(runtime)

  expect(runtime.focuses[0]?.summary).toBeUndefined()
  expect(runtime.focuses[0]?.openItems).toBeUndefined()
  expect(runtime.focuses[0]?.status).toBe('active')
})
