import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { FastifyInstance } from 'fastify'

import {
  buildDeltaSnapshot,
  buildSnapshotHintKey,
  buildStreamPatch,
  closeSseSource,
  cloneUiStream,
  hasMessagePayloadChanged,
  resolveMessageCursor,
  sendSseEvent,
  SSE_HEARTBEAT_MS,
} from './routes-api-events-shared.js'

const getDefaultSnapshot = (orchestrator: Orchestrator) =>
  orchestrator.getWebUiSnapshot()

export const registerEventsRoute = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
): void => {
  app.get('/api/events', async (request, reply) => {
    reply.header('X-Accel-Buffering', 'no')
    reply.header('Cache-Control', 'no-cache, no-transform')
    reply.header('Connection', 'keep-alive')

    let clientClosed = false
    const markClientClosed = () => {
      clientClosed = true
      closeSseSource(reply)
    }
    request.raw.once('aborted', markClientClosed)
    request.raw.once('close', markClientClosed)

    let lastSnapshotHintKey = ''
    let lastStream = cloneUiStream(null)
    let lastMessageCursor: string | undefined
    let uiWakeVersion = orchestrator.getWebUiWakeVersion()
    try {
      const initial = await getDefaultSnapshot(orchestrator)
      lastSnapshotHintKey = buildSnapshotHintKey(initial)
      lastStream = cloneUiStream(initial.stream)
      lastMessageCursor = resolveMessageCursor(undefined, initial.messages)
      if (!sendSseEvent(reply, 'snapshot', initial)) return

      for (;;) {
        if (request.raw.destroyed || clientClosed) break
        const signal = await orchestrator.waitForWebUiSignal(
          SSE_HEARTBEAT_MS,
          uiWakeVersion,
        )
        if (signal.kind === 'timeout') {
          if (!sendSseEvent(reply, 'heartbeat', { at: new Date().toISOString() }))
            break
          continue
        }
        uiWakeVersion = signal.version
        if (signal.kind === 'stream') {
          const nextStream = cloneUiStream(orchestrator.getWebUiStreamSnapshot())
          const patch = buildStreamPatch(lastStream, nextStream)
          if (!patch) continue
          lastStream = nextStream
          if (!sendSseEvent(reply, 'stream', patch)) break
          continue
        }
        if (signal.kind === 'tasks') {
          const tasks = orchestrator.getTasks()
          if (!sendSseEvent(reply, 'tasks', tasks)) break
          continue
        }

        const forceFullMessagesSnapshot = signal.kind === 'messages'
        const snapshot = forceFullMessagesSnapshot
          ? await getDefaultSnapshot(orchestrator)
          : await buildDeltaSnapshot(orchestrator, lastMessageCursor)
        const snapshotHintKey = buildSnapshotHintKey(snapshot)
        if (!forceFullMessagesSnapshot) {
          const messageChanged = hasMessagePayloadChanged(
            lastMessageCursor,
            snapshot.messages,
          )
          if (snapshotHintKey === lastSnapshotHintKey && !messageChanged)
            continue
        }
        lastSnapshotHintKey = snapshotHintKey
        lastStream = cloneUiStream(snapshot.stream)
        lastMessageCursor = resolveMessageCursor(
          lastMessageCursor,
          snapshot.messages,
        )
        if (!sendSseEvent(reply, 'snapshot', snapshot)) break
      }
    } catch (error) {
      if (request.raw.destroyed || clientClosed) return
      sendSseEvent(reply, 'error', {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      request.raw.off('aborted', markClientClosed)
      request.raw.off('close', markClientClosed)
      closeSseSource(reply)
    }
  })
}
