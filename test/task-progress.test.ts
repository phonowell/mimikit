import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  appendTaskProgress,
  readTaskProgress,
} from '../src/storage/task-progress.js'
import {
  loadTaskCheckpoint,
  saveTaskCheckpoint,
} from '../src/storage/task-checkpoint.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-task-progress-'))

test('task progress appends and reads events', async () => {
  const stateDir = await createTmpDir()
  await appendTaskProgress({
    stateDir,
    taskId: 'task-1',
    type: 'standard_start',
    payload: { round: 0 },
  })
  await appendTaskProgress({
    stateDir,
    taskId: 'task-1',
    type: 'tool_call_end',
    payload: { tool: 'read', ok: true },
  })
  const events = await readTaskProgress(stateDir, 'task-1')
  expect(events).toHaveLength(2)
  expect(events[0]?.type).toBe('standard_start')
  expect(events[1]?.payload).toMatchObject({ tool: 'read', ok: true })
})

test('task checkpoint saves and loads state', async () => {
  const stateDir = await createTmpDir()
  await saveTaskCheckpoint({
    stateDir,
    checkpoint: {
      taskId: 'task-2',
      stage: 'running',
      updatedAt: '2026-02-08T00:00:00.000Z',
      state: {
        round: 2,
        transcript: ['step1', 'step2'],
        finalized: false,
        finalOutput: '',
      },
    },
  })

  const loaded = await loadTaskCheckpoint(stateDir, 'task-2')
  expect(loaded?.stage).toBe('running')
  expect(loaded?.state).toMatchObject({ round: 2, finalized: false })
})
