import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { ensureDir } from '../src/fs/paths.js'
import { readTaskProgress } from '../src/storage/task-progress.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-task-progress-'))

test('readTaskProgress merges same task events across daily directories', async () => {
  const stateDir = await createTmpDir()
  const taskId = 'task-1'
  const firstDateDir = join(stateDir, 'task-progress', '2026-03-04')
  const secondDateDir = join(stateDir, 'task-progress', '2026-03-05')

  await ensureDir(firstDateDir)
  await ensureDir(secondDateDir)

  await writeFile(
    join(firstDateDir, `${taskId}.jsonl`),
    `${JSON.stringify({
      taskId,
      type: 'worker_start',
      createdAt: '2026-03-04T23:59:59.000Z',
      payload: {},
    })}\n`,
    'utf8',
  )
  await writeFile(
    join(secondDateDir, `${taskId}.jsonl`),
    `${JSON.stringify({
      taskId,
      type: 'worker_end',
      createdAt: '2026-03-05T00:00:03.000Z',
      payload: { status: 'succeeded' },
    })}\n`,
    'utf8',
  )

  const progress = await readTaskProgress(stateDir, taskId)
  expect(progress).toHaveLength(2)
  expect(progress[0]?.type).toBe('worker_start')
  expect(progress[1]?.type).toBe('worker_end')
})
