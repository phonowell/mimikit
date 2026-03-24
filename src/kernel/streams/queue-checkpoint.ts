import { open, readFile } from 'node:fs/promises'

import { ensureFile } from '../../persistence/fs/paths.js'
import { logSafeError } from '../../persistence/log/safe.js'

import type { JsonPacket } from '../../foundation/types/index.js'

export type PacketWithCursor<TPayload> = JsonPacket<TPayload> & {
  cursor: number
}

export type QueueReadCheckpoint = {
  cursor: number
  byteOffset: number
}

const normalizeCursor = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0

const normalizeByteOffset = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0

const parsePacketLine = async <TPayload>(
  path: string,
  line: string,
): Promise<JsonPacket<TPayload> | undefined> => {
  try {
    return JSON.parse(line) as JsonPacket<TPayload>
  } catch (error) {
    await logSafeError('consumeQueuePacketsIncrementally:json_parse', error, {
      meta: { path, line },
    })
    return undefined
  }
}

const listJsonlLines = (
  content: string,
): Array<{ line: string; byteLength: number }> => {
  const lines: Array<{ line: string; byteLength: number }> = []
  let start = 0
  while (start < content.length) {
    const nextBreak = content.indexOf('\n', start)
    if (nextBreak < 0) {
      const line = content.slice(start)
      if (line.length > 0)
        lines.push({ line, byteLength: Buffer.byteLength(line, 'utf8') })
      break
    }
    const line = content.slice(start, nextBreak)
    lines.push({ line, byteLength: Buffer.byteLength(line, 'utf8') + 1 })
    start = nextBreak + 1
  }
  return lines
}

const resolveCheckpointOffset = async (params: {
  path: string
  checkpoint: QueueReadCheckpoint
}): Promise<QueueReadCheckpoint> => {
  const checkpoint = {
    cursor: normalizeCursor(params.checkpoint.cursor),
    byteOffset: normalizeByteOffset(params.checkpoint.byteOffset),
  }
  if (checkpoint.cursor === 0 || checkpoint.byteOffset > 0) return checkpoint

  await ensureFile(params.path, '')
  const content = await readFile(params.path, 'utf8').catch(async (error) => {
    await logSafeError('resolveQueueCheckpointOffset:read', error, {
      meta: { path: params.path },
    })
    return ''
  })
  let cursor = 0
  let byteOffset = 0
  for (const lineEntry of listJsonlLines(content)) {
    byteOffset += lineEntry.byteLength
    const packet = await parsePacketLine(params.path, lineEntry.line)
    if (!packet) continue
    cursor += 1
    if (cursor >= checkpoint.cursor) break
  }
  return { cursor, byteOffset }
}

const readTailBuffer = async (
  path: string,
  byteOffset: number,
): Promise<{ buffer: Buffer; byteOffset: number }> => {
  await ensureFile(path, '')
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const start = Math.min(normalizeByteOffset(byteOffset), size)
    const remaining = size - start
    if (remaining <= 0) return { buffer: Buffer.alloc(0), byteOffset: start }
    const buffer = Buffer.alloc(remaining)
    let totalRead = 0
    while (totalRead < remaining) {
      const { bytesRead } = await handle.read(
        buffer,
        totalRead,
        remaining - totalRead,
        start + totalRead,
      )
      if (bytesRead <= 0) break
      totalRead += bytesRead
    }
    return {
      buffer: totalRead === remaining ? buffer : buffer.subarray(0, totalRead),
      byteOffset: start,
    }
  } finally {
    await handle.close()
  }
}

export const consumeQueuePacketsIncrementally = async <TPayload>(params: {
  path: string
  checkpoint: QueueReadCheckpoint
  limit?: number
}): Promise<{
  packets: Array<PacketWithCursor<TPayload>>
  checkpoint: QueueReadCheckpoint
}> => {
  const resolvedCheckpoint = await resolveCheckpointOffset(params)
  const { buffer, byteOffset: startOffset } = await readTailBuffer(
    params.path,
    resolvedCheckpoint.byteOffset,
  )
  if (buffer.length === 0) {
    return {
      packets: [],
      checkpoint: resolvedCheckpoint,
    }
  }

  const packets: Array<PacketWithCursor<TPayload>> = []
  let { cursor } = resolvedCheckpoint
  let byteOffset = startOffset
  for (const lineEntry of listJsonlLines(buffer.toString('utf8'))) {
    byteOffset += lineEntry.byteLength
    const packet = await parsePacketLine<TPayload>(params.path, lineEntry.line)
    if (!packet) continue
    cursor += 1
    packets.push({ ...packet, cursor })
    if (params.limit && params.limit > 0 && packets.length >= params.limit)
      break
  }

  return {
    packets,
    checkpoint: { cursor, byteOffset },
  }
}
