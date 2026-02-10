import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildPaths, ensureStateDirs } from '../src/fs/paths.js'
import {
  compactInputQueueIfFullyConsumed,
  compactResultQueueIfFullyConsumed,
  consumeUserInputs,
  consumeWorkerResults,
  loadInputQueueState,
  loadResultQueueState,
  publishUserInput,
  publishWorkerResult,
} from '../src/streams/queues.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-queue-'))

test('input queue append and consume by cursor', async () => {
  const dir = await createTmpDir()
  const paths = buildPaths(dir)
  await ensureStateDirs(paths)

  await publishUserInput({
    paths,
    payload: {
      id: 'in-1',
      text: 'a',
      createdAt: '2026-02-08T00:00:00.000Z',
    },
  })
  await publishUserInput({
    paths,
    payload: {
      id: 'in-2',
      text: 'b',
      createdAt: '2026-02-08T00:00:01.000Z',
    },
  })

  const firstRead = await consumeUserInputs({
    paths,
    fromCursor: 0,
  })
  expect(firstRead.map((item) => item.cursor)).toEqual([1, 2])
  expect(firstRead.map((item) => item.payload.text)).toEqual(['a', 'b'])

  const secondRead = await consumeUserInputs({
    paths,
    fromCursor: 1,
  })
  expect(secondRead).toHaveLength(1)
  expect(secondRead[0]?.cursor).toBe(2)
})

test('result queue append and consume by cursor', async () => {
  const dir = await createTmpDir()
  const paths = buildPaths(dir)
  await ensureStateDirs(paths)

  await publishWorkerResult({
    paths,
    payload: {
      taskId: 'task-1',
      status: 'succeeded',
      ok: true,
      output: 'ok-1',
      durationMs: 10,
      completedAt: '2026-02-08T00:00:00.000Z',
    },
  })
  await publishWorkerResult({
    paths,
    payload: {
      taskId: 'task-2',
      status: 'succeeded',
      ok: true,
      output: 'ok-2',
      durationMs: 10,
      completedAt: '2026-02-08T00:00:01.000Z',
    },
  })

  const read = await consumeWorkerResults({
    paths,
    fromCursor: 0,
  })
  expect(read.map((item) => item.cursor)).toEqual([1, 2])
  expect(read.map((item) => item.payload.taskId)).toEqual(['task-1', 'task-2'])
})

test('input queue compacts only when fully consumed', async () => {
  const dir = await createTmpDir()
  const paths = buildPaths(dir)
  await ensureStateDirs(paths)

  await publishUserInput({
    paths,
    payload: {
      id: 'in-1',
      text: 'a',
      createdAt: '2026-02-08T00:00:00.000Z',
    },
  })
  await publishUserInput({
    paths,
    payload: {
      id: 'in-2',
      text: 'b',
      createdAt: '2026-02-08T00:00:01.000Z',
    },
  })

  const skipped = await compactInputQueueIfFullyConsumed({
    paths,
    cursor: 1,
    minPacketsToCompact: 2,
  })
  expect(skipped).toBe(false)

  const compacted = await compactInputQueueIfFullyConsumed({
    paths,
    cursor: 2,
    minPacketsToCompact: 2,
  })
  expect(compacted).toBe(true)

  const state = await loadInputQueueState(paths)
  expect(state.managerCursor).toBe(0)

  const read = await consumeUserInputs({
    paths,
    fromCursor: 0,
  })
  expect(read).toHaveLength(0)
})

test('result queue compacts only when fully consumed', async () => {
  const dir = await createTmpDir()
  const paths = buildPaths(dir)
  await ensureStateDirs(paths)

  await publishWorkerResult({
    paths,
    payload: {
      taskId: 'task-1',
      status: 'succeeded',
      ok: true,
      output: 'ok-1',
      durationMs: 10,
      completedAt: '2026-02-08T00:00:00.000Z',
    },
  })
  await publishWorkerResult({
    paths,
    payload: {
      taskId: 'task-2',
      status: 'succeeded',
      ok: true,
      output: 'ok-2',
      durationMs: 10,
      completedAt: '2026-02-08T00:00:01.000Z',
    },
  })

  const compacted = await compactResultQueueIfFullyConsumed({
    paths,
    cursor: 2,
    minPacketsToCompact: 2,
  })
  expect(compacted).toBe(true)

  const state = await loadResultQueueState(paths)
  expect(state.managerCursor).toBe(0)

  const read = await consumeWorkerResults({
    paths,
    fromCursor: 0,
  })
  expect(read).toHaveLength(0)
})
