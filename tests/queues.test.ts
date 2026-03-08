import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildPaths } from '../src/fs/paths.js'
import {
  compactInputQueueIfFullyConsumed,
  consumeUserInputs,
  publishUserInput,
} from '../src/streams/queues.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-queue-'))
type QueuePaths = ReturnType<typeof buildPaths>

const publishTwoUserInputs = async (paths: QueuePaths): Promise<void> => {
  await publishUserInput({
    paths,
    payload: {
      id: 'in-1',
      role: 'user',
      text: 'a',
      createdAt: '2026-02-08T00:00:00.000Z',
    },
  })
  await publishUserInput({
    paths,
    payload: {
      id: 'in-2',
      role: 'user',
      text: 'b',
      createdAt: '2026-02-08T00:00:01.000Z',
    },
  })
}

test('input queue consume from cursor 0 returns all appended packets', async () => {
  const dir = await createTmpDir()
  const paths = buildPaths(dir)

  await publishTwoUserInputs(paths)

  const firstRead = await consumeUserInputs({
    paths,
    fromCursor: 0,
  })
  expect(firstRead.map((item) => item.cursor)).toEqual([1, 2])
  expect(firstRead.map((item) => item.payload.text)).toEqual(['a', 'b'])
})

test('input queue does not compact when not fully consumed', async () => {
  const dir = await createTmpDir()
  const paths = buildPaths(dir)

  await publishTwoUserInputs(paths)

  const skipped = await compactInputQueueIfFullyConsumed({
    paths,
    cursor: 1,
    minPacketsToCompact: 2,
  })
  expect(skipped).toBe(false)
})

test('input queue compacts when fully consumed', async () => {
  const dir = await createTmpDir()
  const paths = buildPaths(dir)
  await publishTwoUserInputs(paths)
  const compacted = await compactInputQueueIfFullyConsumed({
    paths,
    cursor: 2,
    minPacketsToCompact: 2,
  })
  expect(compacted).toBe(true)

  const read = await consumeUserInputs({
    paths,
    fromCursor: 0,
  })
  expect(read).toHaveLength(0)
})
