import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  loadRuntimeSnapshot,
  saveRuntimeSnapshot,
  selectPersistedTasks,
} from '../src/storage/runtime-state.js'
import type { Task } from '../src/types/index.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-runtime-state-'))

test('selectPersistedTasks keeps pending and recovers running', () => {
  const tasks: Task[] = [
    {
      id: 'a',
      fingerprint: 'a',
      prompt: 'a',
      title: 'a',
      status: 'pending',
      createdAt: '2026-02-06T00:00:00.000Z',
    },
    {
      id: 'b',
      fingerprint: 'b',
      prompt: 'b',
      title: 'b',
      status: 'running',
      createdAt: '2026-02-06T00:00:00.000Z',
      startedAt: '2026-02-06T00:01:00.000Z',
    },
    {
      id: 'c',
      fingerprint: 'c',
      prompt: 'c',
      title: 'c',
      status: 'succeeded',
      createdAt: '2026-02-06T00:00:00.000Z',
    },
  ]

  const persisted = selectPersistedTasks(tasks)
  expect(persisted).toHaveLength(2)
  expect(persisted[0]?.status).toBe('pending')
  expect(persisted[1]?.id).toBe('b')
  expect(persisted[1]?.status).toBe('pending')
  expect(persisted[1]?.startedAt).toBeUndefined()
})

test('runtime snapshot roundtrip keeps token budget', async () => {
  const stateDir = await createTmpDir()
  await saveRuntimeSnapshot(stateDir, {
    tasks: [
      {
        id: 'x',
        fingerprint: 'x',
        prompt: 'x',
        title: 'x',
        status: 'pending',
        createdAt: '2026-02-06T00:00:00.000Z',
      },
    ],
    tokenBudget: {
      date: '2026-02-06',
      spent: 1234,
    },
  })

  const loaded = await loadRuntimeSnapshot(stateDir)
  expect(loaded.tasks).toHaveLength(1)
  expect(loaded.tokenBudget?.date).toBe('2026-02-06')
  expect(loaded.tokenBudget?.spent).toBe(1234)
})

test('runtime snapshot keeps system task kind', async () => {
  const stateDir = await createTmpDir()
  await saveRuntimeSnapshot(stateDir, {
    tasks: [
      {
        id: 'e1',
        fingerprint: 'system_evolve:e1',
        prompt: 'run evolve loop when idle',
        title: 'System evolve',
        kind: 'system_evolve',
        status: 'pending',
        createdAt: '2026-02-07T00:00:00.000Z',
      },
    ],
  })
  const loaded = await loadRuntimeSnapshot(stateDir)
  expect(loaded.tasks[0]?.kind).toBe('system_evolve')
})

test('runtime snapshot keeps postRestartHealthGate', async () => {
  const stateDir = await createTmpDir()
  await saveRuntimeSnapshot(stateDir, {
    tasks: [],
    postRestartHealthGate: {
      required: true,
      promptPath: 'prompts/agents/manager/system.md',
      promptBackup: 'backup-prompt',
      suitePath: '.mimikit/evolve/feedback-suite.json',
    },
  })
  const loaded = await loadRuntimeSnapshot(stateDir)
  expect(loaded.postRestartHealthGate?.required).toBe(true)
  expect(loaded.postRestartHealthGate?.promptPath).toBe(
    'prompts/agents/manager/system.md',
  )
})
