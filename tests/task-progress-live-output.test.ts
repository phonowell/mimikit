import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import {
  readLatestTaskLiveOutput,
  taskProgressPath,
} from '../src/persistence/storage/task-progress.js'

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(
    join(tmpdir(), 'mimikit-task-progress-live-output-'),
  )
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length))
    await rm(dir, { recursive: true, force: true })
})

test('readLatestTaskLiveOutput ignores persisted summaries from earlier runs', async () => {
  const stateDir = await createTmpDir()
  const taskId = 'task-progress-live-output'
  const path = taskProgressPath(stateDir, taskId, '2026-03-31T00:00:00.000Z')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(
    path,
    [
      JSON.stringify({
        taskId,
        type: 'worker_live_output',
        createdAt: '2026-03-31T00:00:01.000Z',
        payload: { text: 'old summary' },
      }),
      JSON.stringify({
        taskId,
        type: 'worker_live_output',
        createdAt: '2026-03-31T00:00:05.000Z',
        payload: { text: 'current summary' },
      }),
      '',
    ].join('\n'),
    'utf8',
  )

  await expect(
    readLatestTaskLiveOutput(stateDir, taskId, {
      since: '2026-03-31T00:00:02.000Z',
    }),
  ).resolves.toBe('current summary')

  await expect(
    readLatestTaskLiveOutput(stateDir, taskId, {
      since: '2026-03-31T00:00:06.000Z',
    }),
  ).resolves.toBeUndefined()
})
