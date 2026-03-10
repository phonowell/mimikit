import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { FastifyReply } from 'fastify'

export const SSE_HEARTBEAT_MS = 15_000
const SNAPSHOT_MESSAGE_LIMIT = 50

type MessagePayload = {
  messages?: Array<{ id?: unknown }>
  mode?: unknown
}

type SseContextReply = FastifyReply & {
  sseContext: {
    source: {
      end: () => void
      destroyed?: boolean
      writableEnded?: boolean
    }
  }
}

const asMessagePayload = (value: unknown): MessagePayload | null =>
  value && typeof value === 'object' ? (value as MessagePayload) : null

const newestMessageId = (value: unknown): string | undefined => {
  const payload = asMessagePayload(value)
  const messages = payload?.messages
  if (!Array.isArray(messages) || messages.length === 0) return undefined
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const id = messages[index]?.id
    if (typeof id === 'string' && id.trim()) return id
  }
  return undefined
}

export const resolveMessageCursor = (
  cursor: string | undefined,
  value: unknown,
): string | undefined => {
  const mode = asMessagePayload(value)?.mode
  const normalizedMode =
    typeof mode === 'string' ? mode.trim().toLowerCase() : 'full'
  const newestId = newestMessageId(value)
  if (normalizedMode === 'delta') return newestId ?? cursor
  return newestId
}

export const hasMessagePayloadChanged = (
  cursor: string | undefined,
  value: unknown,
): boolean => {
  const payload = asMessagePayload(value)
  if (!payload) return false
  if (resolveMessageCursor(cursor, payload) !== cursor) return true
  const mode =
    typeof payload.mode === 'string'
      ? payload.mode.trim().toLowerCase()
      : 'full'
  return (
    mode === 'delta' &&
    Array.isArray(payload.messages) &&
    payload.messages.length > 0
  )
}

export const buildSnapshotHintKey = (snapshot: {
  status: unknown
  tasks: unknown
  plans: unknown
  focuses: unknown
  choice: unknown
  dutyStatus?: unknown
}): string =>
  JSON.stringify({
    status: snapshot.status,
    tasks: snapshot.tasks,
    plans: snapshot.plans,
    focuses: snapshot.focuses,
    choice: snapshot.choice,
    dutyStatus: snapshot.dutyStatus,
  })

export const buildDeltaSnapshot = async (
  orchestrator: Orchestrator,
  lastMessageCursor?: string,
) => ({
  status: orchestrator.getStatus(),
  messages: await orchestrator.getChatMessages(
    SNAPSHOT_MESSAGE_LIMIT,
    lastMessageCursor,
  ),
  tasks: orchestrator.getTasks(),
  plans: orchestrator.getPlans(),
  focuses: orchestrator.getFocuses(),
  choice: orchestrator.getPendingUserChoice(),
  dutyStatus: await orchestrator.getDutyStatus(true),
})

export const sendSseEvent = (
  reply: FastifyReply,
  event: string,
  payload: unknown,
): boolean => {
  try {
    reply.sse({ event, data: JSON.stringify(payload) })
    return true
  } catch {
    return false
  }
}

export const closeSseSource = (reply: FastifyReply): void => {
  const {
    sseContext: { source },
  } = reply as SseContextReply
  if (source.destroyed || source.writableEnded) return
  try {
    source.end()
  } catch {}
}
