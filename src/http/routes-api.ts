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

const createSseStream = (params: {
  request: FastifyRequest
  reply: FastifyReply
}) => {
  params.reply.hijack()
  const response = params.reply.raw
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
  params.request.raw.once('aborted', markClosed)
  params.request.raw.once('close', markClosed)
  const isClosed = (): boolean =>
    closed || response.destroyed || response.writableEnded
  const writeEvent = (event: string, payload: unknown): boolean => {
    if (isClosed()) return false
    response.write(`event: ${event}\n`)
    response.write(`data: ${JSON.stringify(payload)}\n\n`)
    return true
  }
  const cleanup = () => {
    params.request.raw.off('aborted', markClosed)
    params.request.raw.off('close', markClosed)
    if (!isClosed()) response.end()
  }
  return { isClosed, writeEvent, cleanup }
}

export const registerApiRoutes = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
  _config: AppConfig,
): void => {
  app.get('/api/events', async (request, reply) => {
    const stream = createSseStream({ request, reply })
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
      const message = error instanceof Error ? error.message : String(error)
      stream.writeEvent('error', { error: message })
    } finally {
      stream.cleanup()
    }
  })

  app.get('/api/status', (request, reply) => {
    const payload = orchestrator.getStatus()
    return replyWithEtag({
      request,
      reply,
      prefix: 'status',
      payload,
    })
  })

  app.post('/api/input', async (request, reply) => {
    const result = parseInputBody(request.body, {
      remoteAddress: request.raw.socket.remoteAddress ?? undefined,
      userAgent:
        typeof request.headers['user-agent'] === 'string'
          ? request.headers['user-agent']
          : undefined,
      acceptLanguage:
        typeof request.headers['accept-language'] === 'string'
          ? request.headers['accept-language']
          : undefined,
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
    const limit = parseMessageLimit(query?.limit)
    const afterId =
      typeof query?.afterId === 'string' ? query.afterId.trim() : undefined
    const { messages, mode } = await orchestrator.getChatMessages(
      limit,
      afterId,
    )
    const payload = { messages, mode }
    return replyWithEtag({
      request,
      reply,
      prefix: 'messages',
      payload,
    })
  })

  app.get('/api/tasks', (request) => {
    const query = request.query as Record<string, unknown> | undefined
    const limit = parseTaskLimit(query?.limit)
    return orchestrator.getTasks(limit)
  })

  registerTaskArchiveRoute(app, orchestrator, _config)
  registerTaskProgressRoute(app, orchestrator, _config)
  registerTaskCancelRoute(app, orchestrator)
  registerControlRoutes(app, orchestrator, _config)
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
