import { expect, test } from 'vitest'

import { appendHistory } from '../src/persistence/history/store.js'
import {
  enforceActiveFocusLimit,
  pruneArchivedFocuses,
} from '../src/work/focus/capacity.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'

const createRuntime = (): Promise<RuntimeState> => createTestRuntimeState()

test('enforceActiveFocusLimit does not count global focus against worker maxConcurrent', async () => {
  const runtime = await createRuntime()
  runtime.domain.focuses.push({
    id: 'focus-a',
    title: 'A',
    status: 'active',
    createdAt: '2026-03-05T00:00:01.000Z',
    updatedAt: '2026-03-05T00:00:01.000Z',
    lastActivityAt: '2026-03-05T00:00:01.000Z',
  })

  enforceActiveFocusLimit(runtime)

  const focusA = runtime.domain.focuses.find((item) => item.id === 'focus-a')
  expect(focusA?.status).toBe('active')
})

test('pruneArchivedFocuses keeps archived focus referenced by history', async () => {
  const runtime = await createRuntime()
  runtime.domain.focuses.push(
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

  const ids = new Set(runtime.domain.focuses.map((item) => item.id))
  expect(ids.has('focus-archived-kept')).toBe(true)
  const archivedIds = runtime.domain.focuses
    .filter((item) => item.status === 'archived')
    .map((item) => item.id)
  expect(archivedIds).toHaveLength(3)
  expect(ids.has('focus-archived-2') || ids.has('focus-archived-drop')).toBe(
    true,
  )
})

test('focus capacity maintenance no longer emits webui wake signals', async () => {
  const runtime = await createRuntime()
  runtime.config.worker.maxConcurrent = 1
  runtime.domain.focuses.push({
    id: 'focus-a',
    title: 'A',
    status: 'active',
    createdAt: '2026-03-05T00:00:01.000Z',
    updatedAt: '2026-03-05T00:00:01.000Z',
    lastActivityAt: '2026-03-05T00:00:01.000Z',
  })

  enforceActiveFocusLimit(runtime)

  expect(runtime.process.ui.wakeVersion).toBe(0)
  expect(runtime.process.ui.wakeEvents.size).toBe(0)
})
