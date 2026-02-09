import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  appendJsonpPacket,
  consumeJsonpPackets,
  pruneJsonpPackets,
} from '../src/streams/jsonp-channel.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-jsonp-'))

test('jsonp channel append and consume by cursor', async () => {
  const dir = await createTmpDir()
  const path = join(dir, 'channel.jsonp')

  const cursor1 = await appendJsonpPacket({
    path,
    packet: {
      id: 'packet-1',
      createdAt: '2026-02-08T00:00:00.000Z',
      payload: { text: 'a' },
    },
  })
  const cursor2 = await appendJsonpPacket({
    path,
    packet: {
      id: 'packet-2',
      createdAt: '2026-02-08T00:00:01.000Z',
      payload: { text: 'b' },
    },
  })

  expect(cursor1).toBe(1)
  expect(cursor2).toBe(2)

  const firstRead = await consumeJsonpPackets<{ text: string }>({
    path,
    fromCursor: 0,
  })
  expect(firstRead.map((item) => item.cursor)).toEqual([1, 2])
  expect(firstRead.map((item) => item.payload.text)).toEqual(['a', 'b'])

  const secondRead = await consumeJsonpPackets<{ text: string }>({
    path,
    fromCursor: 1,
  })
  expect(secondRead).toHaveLength(1)
  expect(secondRead[0]?.cursor).toBe(2)
})

test('jsonp channel prune keeps tail packets', async () => {
  const dir = await createTmpDir()
  const path = join(dir, 'channel.jsonp')

  await appendJsonpPacket({
    path,
    packet: {
      id: 'packet-1',
      createdAt: '2026-02-08T00:00:00.000Z',
      payload: { text: 'a' },
    },
  })
  await appendJsonpPacket({
    path,
    packet: {
      id: 'packet-2',
      createdAt: '2026-02-08T00:00:01.000Z',
      payload: { text: 'b' },
    },
  })
  await appendJsonpPacket({
    path,
    packet: {
      id: 'packet-3',
      createdAt: '2026-02-08T00:00:02.000Z',
      payload: { text: 'c' },
    },
  })

  await pruneJsonpPackets({ path, keepFromCursor: 2 })

  const kept = await consumeJsonpPackets<{ text: string }>({
    path,
    fromCursor: 0,
  })
  expect(kept.map((item) => item.cursor)).toEqual([2, 3])
  expect(kept.map((item) => item.payload.text)).toEqual(['b', 'c'])
})
