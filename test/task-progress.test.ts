import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  appendTaskProgress,
  readTaskProgress,
  taskProgressPath,
} from '../src/storage/task-progress.js'

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
