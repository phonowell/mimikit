import { buildPayloadEtag, replyWithEtag } from './etag.js'
import { parseInputBody, parseMessageLimit, parseTaskLimit } from './helpers.js'
import {
  registerControlRoutes,
  registerTaskArchiveRoute,
  registerTaskCancelRoute,
  registerTaskProgressRoute,
} from './routes-api-sections.js'

import type { AppConfig } from '../config.js'
import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

const SSE_HEARTBEAT_MS = 15_000
const SSE_RETRY_MS = 1_500
const SSE_DEFAULT_MESSAGE_LIMIT = 50
const SSE_DEFAULT_TASK_LIMIT = 200

const createSseStream = (request: FastifyRequest, reply: FastifyReply) => {
  reply.hijack()
  const response = reply.raw
  response.statusCode = 200
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  response.setHeader('Cache-Control', 'no-cache, no-transform')
  response.setHeader('Connection', 'keep-alive')
  response.setHeader('X-Accel-Buffering', 'no')
  if (typeof response.flushHeaders === 'function') response.flushHeaders()
  response.write(`retry: ${SSE_RETRY_MS}\n\n`)

  let closed = false
  const markClosed = () => {
    closed = true
  }
  request.raw.once('aborted', markClosed)
  request.raw.once('close', markClosed)

  const isClosed = (): boolean =>
    closed || response.destroyed || response.writableEnded

  return {
    isClosed,
    writeEvent: (event: string, payload: unknown): boolean => {
      if (isClosed()) return false
      response.write(`event: ${event}\n`)
      response.write(`data: ${JSON.stringify(payload)}\n\n`)
      return true
    },
    cleanup: () => {
      request.raw.off('aborted', markClosed)
      request.raw.off('close', markClosed)
      if (!isClosed()) response.end()
    },
  }
}

const readHeader = (
  headers: FastifyRequest['headers'],
  key: string,
): string | undefined =>
  typeof headers[key] === 'string' ? headers[key] : undefined

export const registerApiRoutes = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
  config: AppConfig,
): void => {
  app.get('/api/events', async (request, reply) => {
    const stream = createSseStream(request, reply)
    let lastSnapshotEtag = ''
    try {
      const initial = await orchestrator.getWebUiSnapshot(
        SSE_DEFAULT_MESSAGE_LIMIT,
        SSE_DEFAULT_TASK_LIMIT,
      )
      lastSnapshotEtag = buildPayloadEtag('events', initial)
      stream.writeEvent('snapshot', initial)

      for (;;) {
        if (stream.isClosed()) break
        await orchestrator.waitForWebUiSignal(SSE_HEARTBEAT_MS)
        if (stream.isClosed()) break
        const snapshot = await orchestrator.getWebUiSnapshot(
          SSE_DEFAULT_MESSAGE_LIMIT,
          SSE_DEFAULT_TASK_LIMIT,
        )
        const snapshotEtag = buildPayloadEtag('events', snapshot)
        if (snapshotEtag === lastSnapshotEtag) continue
        lastSnapshotEtag = snapshotEtag
        if (!stream.writeEvent('snapshot', snapshot)) break
      }
    } catch (error) {
      stream.writeEvent('error', {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      stream.cleanup()
    }
  })

  app.get('/api/status', (request, reply) =>
    replyWithEtag({
      request,
      reply,
      prefix: 'status',
      payload: orchestrator.getStatus(),
    }),
  )

  app.post('/api/input', async (request, reply) => {
    const result = parseInputBody(request.body, {
      remoteAddress: request.raw.socket.remoteAddress ?? undefined,
      userAgent: readHeader(request.headers, 'user-agent'),
      acceptLanguage: readHeader(request.headers, 'accept-language'),
    })
    if ('error' in result) {
      reply.code(400).send({ error: result.error })
      return
    }
    const id = await orchestrator.addUserInput(
      result.text,
      result.meta,
      result.quote,
    )
    reply.send({ id })
  })

  app.get('/api/messages', async (request, reply) => {
    const query = request.query as Record<string, unknown> | undefined
    const { messages, mode } = await orchestrator.getChatMessages(
      parseMessageLimit(query?.limit),
      typeof query?.afterId === 'string' ? query.afterId.trim() : undefined,
    )
    return replyWithEtag({
      request,
      reply,
      prefix: 'messages',
      payload: { messages, mode },
    })
  })

  app.get('/api/tasks', (request) => {
    const query = request.query as Record<string, unknown> | undefined
    return orchestrator.getTasks(parseTaskLimit(query?.limit))
  })

  registerTaskArchiveRoute(app, orchestrator, config)
  registerTaskProgressRoute(app, orchestrator, config)
  registerTaskCancelRoute(app, orchestrator)
  registerControlRoutes(app, orchestrator, config)
}

export const registerNotFoundHandler = (app: FastifyInstance): void => {
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET') {
      reply.code(404).type('text/plain').send('Not Found')
      return
    }
    reply.code(404).send({ error: 'not found' })
  })
}
