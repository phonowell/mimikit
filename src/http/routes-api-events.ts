import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { UiAgentStream } from '../orchestrator/core/runtime-state.js'
import type { TokenUsage } from '../types/index.js'

const SSE_HEARTBEAT_MS = 15_000
const getDefaultSnapshot = (orchestrator: Orchestrator) =>
  orchestrator.getWebUiSnapshot()

const buildSnapshotHint = (orchestrator: Orchestrator) => ({
  status: orchestrator.getStatus(),
  tasks: orchestrator.getTasks(),
  todos: orchestrator.getTodos(),
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
  const source = reply.sseContext?.source
  if (!source) return
  source.end()
}

export const registerEventsRoute = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
): void => {
  app.get('/api/events', async (request, reply) => {
    reply.header('X-Accel-Buffering', 'no')
    let closed = false
    const markClosed = () => {
      closed = true
      closeSseSource(reply)
    }
    request.raw.once('aborted', markClosed)
    request.raw.once('close', markClosed)

    let lastSnapshotKey = ''
    let lastSnapshotHintKey = ''
    let lastStream = cloneUiStream(null)
    try {
      const initial = await getDefaultSnapshot(orchestrator)
      lastSnapshotKey = asStableJson(initial)
      lastSnapshotHintKey = asStableJson({
        status: initial.status,
        tasks: initial.tasks,
        todos: initial.todos,
        focuses: initial.focuses,
        stream: initial.stream,
      })
      lastStream = cloneUiStream(initial.stream)
      sendSseEvent(reply, 'snapshot', initial)

      for (;;) {
        if (closed) break
        const signal = await orchestrator.waitForWebUiSignal(SSE_HEARTBEAT_MS)
        if (closed) break
        if (signal === 'timeout') continue
        if (signal === 'stream') {
          const nextStream = cloneUiStream(orchestrator.getWebUiStreamSnapshot())
          const patch = buildStreamPatch(lastStream, nextStream)
          if (!patch) continue
          lastStream = nextStream
          sendSseEvent(reply, 'stream', patch)
          continue
        }
        const snapshotHint = buildSnapshotHint(orchestrator)
        const snapshotHintKey = asStableJson(snapshotHint)
        if (snapshotHintKey === lastSnapshotHintKey) continue
        const snapshot = await getDefaultSnapshot(orchestrator)
        const snapshotKey = asStableJson(snapshot)
        if (snapshotKey === lastSnapshotKey) {
          lastSnapshotHintKey = snapshotHintKey
          continue
        }
        lastSnapshotHintKey = snapshotHintKey
        lastSnapshotKey = snapshotKey
        lastStream = cloneUiStream(snapshot.stream)
        sendSseEvent(reply, 'snapshot', snapshot)
      }
    } catch (error) {
      if (closed) return
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
