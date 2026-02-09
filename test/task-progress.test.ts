import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  appendTaskProgress,
  readTaskProgress,
  taskProgressPath,
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
    type: 'action_call_end',
    payload: { action: 'read_file', ok: true },
  })
  const events = await readTaskProgress(stateDir, 'task-1')
  expect(events).toHaveLength(2)
  expect(events[0]?.type).toBe('standard_start')
  expect(events[1]?.payload).toMatchObject({ action: 'read_file', ok: true })
})

test('task progress ignores invalid jsonl entries', async () => {
  const stateDir = await createTmpDir()
  const path = taskProgressPath(stateDir, 'task-raw')
  await mkdir(join(stateDir, 'task-progress'), { recursive: true })
  await writeFile(
    path,
    [
      JSON.stringify({
        taskId: 'task-raw',
        type: 'standard_start',
        createdAt: '2026-02-09T00:00:00.000Z',
        payload: { round: 1 },
      }),
      JSON.stringify({
        taskId: 'task-raw',
        type: 'broken',
        createdAt: '2026-02-09T00:00:01.000Z',
        payload: {},
        extra: true,
      }),
      'not-json',
    ].join('\n'),
    'utf8',
  )

  const events = await readTaskProgress(stateDir, 'task-raw')
  expect(events).toHaveLength(1)
  expect(events[0]?.type).toBe('standard_start')
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

test('task checkpoint rejects invalid shape', async () => {
  const stateDir = await createTmpDir()
  const path = join(stateDir, 'task-checkpoints', 'task-3.json')
  await mkdir(join(stateDir, 'task-checkpoints'), { recursive: true })
  await writeFile(
    path,
    JSON.stringify({
      taskId: 'task-3',
      stage: 'running',
      updatedAt: '2026-02-09T00:00:00.000Z',
      state: { round: 1 },
      extra: true,
    }),
    'utf8',
  )

  const loaded = await loadTaskCheckpoint(stateDir, 'task-3')
  expect(loaded).toBeNull()
})
