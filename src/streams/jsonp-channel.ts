import { readJsonl, updateJsonl } from '../storage/jsonl.js'

import type { JsonPacket } from '../types/index.js'

type ChannelState<TPayload> = {
  cursor: number
  packets: Array<JsonPacket<TPayload>>
}

type PacketWithCursor<TPayload> = JsonPacket<TPayload> & {
  cursor: number
}

const INITIAL_STATE = { cursor: 0, packets: [] }

const asState = <TPayload>(
  value: unknown,
): ChannelState<TPayload> | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const record = value as {
    cursor?: unknown
    packets?: unknown
  }
  if (!Array.isArray(record.packets)) return undefined
  const cursor =
    typeof record.cursor === 'number' && Number.isFinite(record.cursor)
      ? Math.max(0, Math.floor(record.cursor))
      : 0
  const packets = record.packets.filter(
    (item): item is JsonPacket<TPayload> =>
      Boolean(item) && typeof item === 'object',
  )
  return { cursor, packets }
}

const withCursor = <TPayload>(
  packets: Array<JsonPacket<TPayload>>,
  startCursor: number,
): Array<PacketWithCursor<TPayload>> =>
  packets.map((packet, index) => ({
    ...packet,
    cursor: startCursor + index + 1,
  }))

const readState = async <TPayload>(
  path: string,
): Promise<ChannelState<TPayload>> => {
  const rows = await readJsonl<unknown>(path)
  const last = rows.at(-1)
  const parsed = asState<TPayload>(last)
  if (!parsed) return { ...INITIAL_STATE }
  return parsed
}

export const appendJsonpPacket = async <TPayload>(params: {
  path: string
  packet: JsonPacket<TPayload>
}): Promise<number> => {
  let nextCursor = 0
  await updateJsonl<ChannelState<TPayload>>(params.path, (rows) => {
    const current = rows.at(-1) ?? { ...INITIAL_STATE }
    const state = asState<TPayload>(current) ?? { ...INITIAL_STATE }
    const withNew = [...state.packets, params.packet]
    nextCursor = state.cursor + 1
    return [
      {
        cursor: state.cursor + 1,
        packets: withNew,
      },
    ]
  })
  return nextCursor
}

export const consumeJsonpPackets = async <TPayload>(params: {
  path: string
  fromCursor: number
  limit?: number
}): Promise<Array<PacketWithCursor<TPayload>>> => {
  const state = await readState<TPayload>(params.path)
  if (state.packets.length === 0) return []
  const start = Math.max(0, Math.floor(params.fromCursor))
  const all = withCursor(state.packets, state.cursor - state.packets.length)
  const filtered = all.filter((packet) => packet.cursor > start)
  if (!params.limit || params.limit <= 0) return filtered
  return filtered.slice(0, params.limit)
}

export const pruneJsonpPackets = async <TPayload>(params: {
  path: string
  keepFromCursor: number
}): Promise<void> => {
  await updateJsonl<ChannelState<TPayload>>(params.path, (rows) => {
    const current = rows.at(-1) ?? { ...INITIAL_STATE }
    const state = asState<TPayload>(current) ?? { ...INITIAL_STATE }
    const all = withCursor(state.packets, state.cursor - state.packets.length)
    const kept = all
      .filter((packet) => packet.cursor >= params.keepFromCursor)
      .map(({ cursor: _cursor, ...packet }) => packet)
    return [{ cursor: state.cursor, packets: kept }]
  })
}

export const readJsonpCursor = async (path: string): Promise<number> => {
  const state = await readState(path)
  return state.cursor
}
