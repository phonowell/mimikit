import type { Orchestrator } from '../../kernel/orchestrator/orchestrator-service.js'
import type { FastifyReply, FastifyRequest } from 'fastify'

export const SSE_HEARTBEAT_MS = 15_000
const SNAPSHOT_MESSAGE_LIMIT = 50

type MessagePayload = {
  messages?: Array<{ id?: unknown }>
  mode?: unknown
}

type SseContextReply = FastifyReply & {
  sseContext?: {
    source: {
      end: () => void
      destroyed?: boolean
      writableEnded?: boolean
    }
  }
}

const resolveSseSource = (
  reply: FastifyReply,
): SseContextReply['sseContext']['source'] | null =>
  (reply as { sseContext?: SseContextReply['sseContext'] }).sseContext
    ?.source ?? null

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
}): string =>
  JSON.stringify({
    status: snapshot.status,
    tasks: snapshot.tasks,
  })

export const buildDeltaSnapshot = (
  orchestrator: Orchestrator,
  lastMessageCursor?: string,
) =>
  orchestrator.getWebUiDeltaSnapshot(SNAPSHOT_MESSAGE_LIMIT, lastMessageCursor)

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

export const registerSseClientCloseHandlers = (
  request: FastifyRequest,
  reply: FastifyReply,
  onClose: () => void,
): (() => void) => {
  let closed = false
  const handleClose = () => {
    if (closed) return
    closed = true
    onClose()
  }
  request.raw.once('aborted', handleClose)
  reply.raw.once('close', handleClose)
  return () => {
    request.raw.off('aborted', handleClose)
    reply.raw.off('close', handleClose)
  }
}

export const closeSseSource = (reply: FastifyReply): void => {
  const source = resolveSseSource(reply)
  if (!source) return
  if (source.destroyed || source.writableEnded) return
  try {
    source.end()
  } catch {}
}
