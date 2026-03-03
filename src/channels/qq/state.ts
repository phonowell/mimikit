import { join } from 'node:path'

import { readJson, writeJson } from '../../fs/json.js'
import { parseIsoMs } from '../../shared/time.js'
import { nowIso } from '../../shared/utils.js'

import { runSerialized } from '../../storage/serialized-lock.js'

import { parseQqEventState, type QqEventState } from './state-schema.js'

const QQ_EVENT_STATE_DIR = 'qq'
const QQ_EVENT_STATE_FILE = 'event-state.json'
const SEEN_ID_TTL_MS = 3 * 24 * 60 * 60 * 1000
const REPLY_STATE_TTL_MS = 24 * 60 * 60 * 1000

const resolveQqEventStatePath = (stateDir: string): string =>
  join(stateDir, QQ_EVENT_STATE_DIR, QQ_EVENT_STATE_FILE)

const parseIsoOrFallback = (value: string, fallbackMs: number): number =>
  parseIsoMs(value) ?? fallbackMs

const pruneRecordByTtl = <T>(
  records: Record<string, T>,
  nowMs: number,
  ttlMs: number,
  pickTimestamp: (value: T) => string,
): Record<string, T> =>
  Object.fromEntries(
    Object.entries(records).filter(([, value]) => {
      const ts = parseIsoOrFallback(pickTimestamp(value), 0)
      return nowMs - ts <= ttlMs
    }),
  )

const pruneStateByTtl = (state: QqEventState, nowMs: number): QqEventState => ({
  ...state,
  seenEventIds: pruneRecordByTtl(state.seenEventIds, nowMs, SEEN_ID_TTL_MS, (v) => v),
  seenMessageIds: pruneRecordByTtl(
    state.seenMessageIds,
    nowMs,
    SEEN_ID_TTL_MS,
    (v) => v,
  ),
  replyState: pruneRecordByTtl(
    state.replyState,
    nowMs,
    REPLY_STATE_TTL_MS,
    (v) => v.updatedAt,
  ),
})

const loadQqEventState = async (path: string, now: string): Promise<QqEventState> =>
  pruneStateByTtl(
    {
      ...parseQqEventState(await readJson(path, {}, { ensureFile: true }), now),
      updatedAt: now,
    },
    Date.now(),
  )

export const registerQqInboundMessage = async (params: {
  stateDir: string
  eventId?: string
  messageId: string
  receivedAt?: string
}): Promise<{ ok: true } | { ok: false; reason: 'duplicate_event' | 'duplicate_message' }> => {
  const path = resolveQqEventStatePath(params.stateDir)
  const now = params.receivedAt ?? nowIso()
  return runSerialized(path, async () => {
    const state = await loadQqEventState(path, now)
    const eventId = params.eventId?.trim()
    const messageId = params.messageId.trim()
    if (!messageId)
      return { ok: false as const, reason: 'duplicate_message' as const }
    if (eventId && state.seenEventIds[eventId])
      return { ok: false as const, reason: 'duplicate_event' as const }
    if (state.seenMessageIds[messageId])
      return { ok: false as const, reason: 'duplicate_message' as const }

    if (eventId) state.seenEventIds[eventId] = now
    state.seenMessageIds[messageId] = now
    await writeJson(path, state)
    return { ok: true as const }
  })
}

export const reserveQqReplySeq = async (params: {
  stateDir: string
  messageId: string
  maxReplies: number
  reservedAt?: string
}): Promise<{ ok: true; msgSeq: number } | { ok: false; reason: 'reply_limit_exceeded' }> => {
  const path = resolveQqEventStatePath(params.stateDir)
  const now = params.reservedAt ?? nowIso()
  return runSerialized(path, async () => {
    const state = await loadQqEventState(path, now)
    const messageId = params.messageId.trim()
    if (!messageId)
      return { ok: false as const, reason: 'reply_limit_exceeded' as const }

    const seq = (state.replyState[messageId]?.seq ?? 0) + 1
    if (seq > params.maxReplies)
      return { ok: false as const, reason: 'reply_limit_exceeded' as const }

    state.replyState[messageId] = {
      seq,
      firstSeenAt: state.replyState[messageId]?.firstSeenAt ?? now,
      updatedAt: now,
    }
    await writeJson(path, state)
    return { ok: true as const, msgSeq: seq }
  })
}
