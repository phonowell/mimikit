import { expect, test } from 'vitest'

import {
  enforceActiveFocusLimit,
  pruneArchivedFocuses,
} from '../src/work/focus/capacity.js'
import { GLOBAL_FOCUS_ID } from '../src/work/focus/constants.js'
import { appendHistory } from '../src/persistence/history/store.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState()
  runtime.worker.queue = {
    size: 0,
    pending: 0,
    sizeBy: () => 0,
    add: async () => undefined,
    pause: () => undefined,
    clear: () => undefined,
    onIdle: async () => undefined,
  } as RuntimeState['worker']['queue']
  return runtime
}

test('enforceActiveFocusLimit does not count global focus against worker maxConcurrent', async () => {
  const runtime = await createRuntime()
  runtime.focuses.push({
    id: 'focus-a',
    title: 'A',
    status: 'active',
    createdAt: '2026-03-05T00:00:01.000Z',
    updatedAt: '2026-03-05T00:00:01.000Z',
    lastActivityAt: '2026-03-05T00:00:01.000Z',
  })

  enforceActiveFocusLimit(runtime)

  const focusA = runtime.focuses.find((item) => item.id === 'focus-a')
  expect(focusA?.status).toBe('active')
})

test('pruneArchivedFocuses keeps archived focus referenced by history', async () => {
  const runtime = await createRuntime()
  runtime.focuses.push(
    {
      id: 'focus-archived-kept',
      title: 'Kept',
      status: 'archived',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      lastActivityAt: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'focus-archived-2',
      title: 'Archive 2',
      status: 'archived',
      createdAt: '2026-03-02T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      lastActivityAt: '2026-03-02T00:00:00.000Z',
    },
    {
      id: 'focus-archived-drop',
      title: 'Drop',
      status: 'archived',
      createdAt: '2026-03-03T00:00:00.000Z',
      updatedAt: '2026-03-03T00:00:00.000Z',
      lastActivityAt: '2026-03-03T00:00:00.000Z',
    },
  )
  await appendHistory(runtime.paths.history, {
    id: 'hist-1',
    role: 'user',
    text: 'keep archived focus',
    createdAt: '2026-03-05T00:00:00.000Z',
    focusId: 'focus-archived-kept',
  })

  await pruneArchivedFocuses(runtime)

  const ids = new Set(runtime.focuses.map((item) => item.id))
  expect(ids.has('focus-archived-kept')).toBe(true)
  const archivedIds = runtime.focuses
    .filter((item) => item.status === 'archived')
    .map((item) => item.id)
  expect(archivedIds).toHaveLength(3)
  expect(
    ids.has('focus-archived-2') || ids.has('focus-archived-drop'),
  ).toBe(true)
})
