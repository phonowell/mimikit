import {
  buildDeltaSnapshot,
  buildSnapshotHintKey,
  closeSseSource,
  hasMessagePayloadChanged,
  resolveMessageCursor,
  sendSseEvent,
  SSE_HEARTBEAT_MS,
} from './routes-api-events-shared.js'
import { createSessionIngressLogger } from './session-ingress-log.js'

import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { FastifyInstance } from 'fastify'

const getDefaultSnapshot = (orchestrator: Orchestrator) =>
  orchestrator.getWebUiSnapshot()

export const registerEventsRoute = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
): void => {
  const ingressLogger = createSessionIngressLogger()

  app.get('/api/events', async (request, reply) => {
    reply.header('X-Accel-Buffering', 'no')
    reply.header('Cache-Control', 'no-cache, no-transform')
    reply.header('Connection', 'keep-alive')

    let clientClosed = false
    const markClientClosed = () => {
      clientClosed = true
      closeSseSource(reply)
    }
    const isClientClosed = (): boolean => clientClosed
    request.raw.once('aborted', markClientClosed)
    request.raw.once('close', markClientClosed)

    let lastSnapshotHintKey = ''
    let lastMessageCursor: string | undefined
    let uiWakeVersion = orchestrator.getWebUiWakeVersion()
    try {
      const initial = await getDefaultSnapshot(orchestrator)
      lastSnapshotHintKey = buildSnapshotHintKey(initial)
      lastMessageCursor = resolveMessageCursor(undefined, initial.messages)
      if (!sendSseEvent(reply, 'snapshot', initial)) return
      ingressLogger.logIncomingMessages(initial.messages)

      for (;;) {
        if (isClientClosed()) break
        const signal = await orchestrator.waitForWebUiSignal(
          SSE_HEARTBEAT_MS,
          uiWakeVersion,
        )
        if (signal.kind === 'timeout') {
          if (
            !sendSseEvent(reply, 'heartbeat', { at: new Date().toISOString() })
          )
            break
          continue
        }
        uiWakeVersion = signal.version
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
        lastMessageCursor = resolveMessageCursor(
          lastMessageCursor,
          snapshot.messages,
        )
        if (!sendSseEvent(reply, 'snapshot', snapshot)) break
        ingressLogger.logIncomingMessages(snapshot.messages)
      }
    } catch (error) {
      if (isClientClosed()) return
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
