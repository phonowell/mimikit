import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildPaths } from '../src/persistence/fs/paths.js'
import {
  compactInputQueueIfFullyConsumed,
  consumeUserInputs,
  consumeUserInputsIncrementally,
  publishUserInput,
} from '../src/kernel/streams/queues.js'

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

test('incremental input queue consume resumes from checkpoint without replaying old packets', async () => {
  const dir = await createTmpDir()
  const paths = buildPaths(dir)

  await publishTwoUserInputs(paths)

  const firstRead = await consumeUserInputsIncrementally({
    paths,
    checkpoint: { cursor: 0, byteOffset: 0 },
  })
  expect(firstRead.packets.map((item) => item.cursor)).toEqual([1, 2])
  expect(firstRead.packets.map((item) => item.payload.text)).toEqual(['a', 'b'])

  await publishUserInput({
    paths,
    payload: {
      id: 'in-3',
      role: 'user',
      text: 'c',
      createdAt: '2026-02-08T00:00:02.000Z',
    },
  })

  const secondRead = await consumeUserInputsIncrementally({
    paths,
    checkpoint: firstRead.checkpoint,
  })
  expect(secondRead.packets.map((item) => item.cursor)).toEqual([3])
  expect(secondRead.packets[0]?.payload.text).toBe('c')
})

test('incremental input queue consume rebuilds byte offset from persisted cursor', async () => {
  const dir = await createTmpDir()
  const paths = buildPaths(dir)

  await publishTwoUserInputs(paths)
  await publishUserInput({
    paths,
    payload: {
      id: 'in-3',
      role: 'user',
      text: 'c',
      createdAt: '2026-02-08T00:00:02.000Z',
    },
  })

  const read = await consumeUserInputsIncrementally({
    paths,
    checkpoint: { cursor: 2, byteOffset: 0 },
  })
  expect(read.packets.map((item) => item.cursor)).toEqual([3])
  expect(read.packets[0]?.payload.text).toBe('c')
})
