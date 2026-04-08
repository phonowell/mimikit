import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import {
  appendTaskProgress,
  readLatestTaskLiveOutput,
  readTaskProgress,
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

test('appendTaskProgress clips oversized text payloads so persisted jsonl stays bounded and parseable', async () => {
  const stateDir = await createTmpDir()
  const taskId = 'task-progress-clipped-text'
  const hugeText = `${'x'.repeat(20000)}\n${'y'.repeat(20000)}`

  await appendTaskProgress({
    stateDir,
    taskId,
    type: 'worker_activity',
    payload: { text: hugeText },
  })

  const entries = await readTaskProgress(stateDir, taskId)
  expect(entries).toHaveLength(1)
  expect(entries[0]?.payload.text).not.toBe(hugeText)
  expect(typeof entries[0]?.payload.text).toBe('string')
  expect((entries[0]?.payload.text as string).length).toBeLessThan(
    hugeText.length,
  )
})

test('appendTaskProgress keeps concurrent appends parseable for the same task log', async () => {
  const stateDir = await createTmpDir()
  const taskId = 'task-progress-concurrent-appends'

  await Promise.all(
    Array.from({ length: 24 }, (_, index) =>
      appendTaskProgress({
        stateDir,
        taskId,
        type: 'worker_activity',
        payload: { text: `chunk-${index}` },
      }),
    ),
  )

  const entries = await readTaskProgress(stateDir, taskId)
  expect(entries).toHaveLength(24)
  expect(new Set(entries.map((entry) => String(entry.payload.text))).size).toBe(
    24,
  )
})
