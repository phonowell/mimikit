import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { UiAgentStream } from '../orchestrator/core/runtime-state.js'
import type { TokenUsage } from '../types/index.js'
import type { FastifyInstance, FastifyReply } from 'fastify'

const SSE_HEARTBEAT_MS = 15_000
const SNAPSHOT_MESSAGE_LIMIT = 50
const getDefaultSnapshot = (orchestrator: Orchestrator) =>
  orchestrator.getWebUiSnapshot()

type SnapshotMessagesPayload = {
  messages?: Array<{ id?: unknown }>
  mode?: unknown
}

const asSnapshotMessagesPayload = (
  value: unknown,
): SnapshotMessagesPayload | null =>
  value && typeof value === 'object' ? (value as SnapshotMessagesPayload) : null

const findNewestMessageId = (value: unknown): string | undefined => {
  const payload = asSnapshotMessagesPayload(value)
  const messages = payload?.messages
  if (!Array.isArray(messages) || messages.length === 0) return undefined
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index]
    const id =
      item && typeof item === 'object'
        ? (item as { id?: unknown }).id
        : undefined
    if (typeof id === 'string' && id.trim()) return id
  }
  return undefined
}

const resolveMessageCursor = (
  cursor: string | undefined,
  value: unknown,
): string | undefined => {
  const payload = asSnapshotMessagesPayload(value)
  const mode =
    payload && typeof payload.mode === 'string' ? payload.mode.trim() : 'full'
  const newestId = findNewestMessageId(value)
  if (mode === 'delta') return newestId ?? cursor
  return newestId
}

const getDeltaSnapshot = async (
  orchestrator: Orchestrator,
  afterMessageId?: string,
) => ({
  status: orchestrator.getStatus(),
  messages: await orchestrator.getChatMessages(
    SNAPSHOT_MESSAGE_LIMIT,
    afterMessageId,
  ),
  tasks: orchestrator.getTasks(),
  plans: orchestrator.getPlans(),
  focuses: orchestrator.getFocuses(),
  stream: cloneUiStream(orchestrator.getWebUiStreamSnapshot()),
})

const buildSnapshotHint = (orchestrator: Orchestrator) => ({
  status: orchestrator.getStatus(),
  tasks: orchestrator.getTasks(),
  plans: orchestrator.getPlans(),
  focuses: orchestrator.getFocuses(),
  stream: cloneUiStream(orchestrator.getWebUiStreamSnapshot()),
})

const asStableJson = (value: unknown): string => JSON.stringify(value)

type StreamPatch =
  | { mode: 'clear' }
  | { mode: 'replace'; stream: UiAgentStream }
  | {
      mode: 'delta'
      id: string
      delta: string
      updatedAt: string
      usage?: TokenUsage | null
    }

const cloneUiStream = (stream: UiAgentStream | null): UiAgentStream | null =>
  stream
    ? {
        ...stream,
        ...(stream.usage ? { usage: { ...stream.usage } } : {}),
      }
    : null

const usageKey = (usage?: TokenUsage): string =>
  usage ? JSON.stringify(usage) : ''

const buildStreamPatch = (
  prev: UiAgentStream | null,
  next: UiAgentStream | null,
): StreamPatch | null => {
  if (!next) return prev ? { mode: 'clear' } : null
  if (!prev) return { mode: 'replace', stream: next }
  if (prev.id !== next.id) return { mode: 'replace', stream: next }
  if (!next.text.startsWith(prev.text)) return { mode: 'replace', stream: next }
  const delta = next.text.slice(prev.text.length)
  const usageChanged = usageKey(prev.usage) !== usageKey(next.usage)
  if (!delta && !usageChanged) return null
  return {
    mode: 'delta',
    id: next.id,
    delta,
    updatedAt: next.updatedAt,
    ...(usageChanged ? { usage: next.usage ?? null } : {}),
  }
}

const sendSseEvent = (
  reply: FastifyReply,
  event: string,
  payload: unknown,
): void => {
  reply.sse({ event, data: JSON.stringify(payload) })
}

const closeSseSource = (reply: FastifyReply): void => {
  reply.sseContext.source.end()
}

export const registerEventsRoute = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
): void => {
  app.get('/api/events', async (request, reply) => {
    reply.header('X-Accel-Buffering', 'no')
    const markClosed = () => closeSseSource(reply)
    request.raw.once('aborted', markClosed)
    request.raw.once('close', markClosed)

    let lastSnapshotHintKey = ''
    let lastStream = cloneUiStream(null)
    let lastMessageCursor: string | undefined
    let uiWakeVersion = orchestrator.getWebUiWakeVersion()
    try {
      const initial = await getDefaultSnapshot(orchestrator)
      lastSnapshotHintKey = asStableJson({
        status: initial.status,
        tasks: initial.tasks,
        plans: initial.plans,
        focuses: initial.focuses,
        stream: initial.stream,
      })
      lastStream = cloneUiStream(initial.stream)
      lastMessageCursor = resolveMessageCursor(undefined, initial.messages)
      sendSseEvent(reply, 'snapshot', initial)

      for (;;) {
        if (request.raw.destroyed) break
        const signal = await orchestrator.waitForWebUiSignal(
          SSE_HEARTBEAT_MS,
          uiWakeVersion,
        )
        if (signal.kind === 'timeout') continue
        uiWakeVersion = signal.version
        if (signal.kind === 'stream') {
          const nextStream = cloneUiStream(
            orchestrator.getWebUiStreamSnapshot(),
          )
          const patch = buildStreamPatch(lastStream, nextStream)
          if (!patch) continue
          lastStream = nextStream
          sendSseEvent(reply, 'stream', patch)
          continue
        }
        const snapshotHint = buildSnapshotHint(orchestrator)
        const snapshotHintKey = asStableJson(snapshotHint)
        if (snapshotHintKey === lastSnapshotHintKey) continue
        const snapshot = await getDeltaSnapshot(orchestrator, lastMessageCursor)
        lastSnapshotHintKey = snapshotHintKey
        lastStream = cloneUiStream(snapshot.stream)
        lastMessageCursor = resolveMessageCursor(
          lastMessageCursor,
          snapshot.messages,
        )
        sendSseEvent(reply, 'snapshot', snapshot)
      }
    } catch (error) {
      if (request.raw.destroyed) return
      sendSseEvent(reply, 'error', {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      request.raw.off('aborted', markClosed)
      request.raw.off('close', markClosed)
      closeSseSource(reply)
    }
  })
}
