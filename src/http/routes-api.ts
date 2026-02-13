import { createHash } from 'node:crypto'

import { parseInputBody, parseMessageLimit, parseTaskLimit } from './helpers.js'
import {
  registerControlRoutes,
  registerTaskArchiveRoute,
  registerTaskCancelRoute,
  registerTaskProgressRoute,
} from './routes-api-sections.js'

import type { AppConfig } from '../config.js'
import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { FastifyInstance } from 'fastify'

const SSE_HEARTBEAT_MS = 15_000
const SSE_RETRY_MS = 1_500
const SSE_DEFAULT_MESSAGE_LIMIT = 50
const SSE_DEFAULT_TASK_LIMIT = 200

const comparableEtag = (value: string): string =>
  value.trim().replace(/^W\//, '')

const matchesIfNoneMatch = (ifNoneMatch: unknown, etag: string): boolean => {
  if (typeof ifNoneMatch !== 'string') return false
  const candidates = ifNoneMatch
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (candidates.includes('*')) return true
  const normalizedEtag = comparableEtag(etag)
  return candidates.some(
    (candidate) => comparableEtag(candidate) === normalizedEtag,
  )
}

const buildPayloadEtag = (prefix: string, payload: unknown): string => {
  const digest = createHash('sha1')
    .update(JSON.stringify(payload))
    .digest('base64url')
  return `W/"${prefix}-${digest}"`
}

export const registerApiRoutes = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
  _config: AppConfig,
): void => {
  app.get('/api/events', async (request, reply) => {
    reply.hijack()
    const res = reply.raw
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    if (typeof res.flushHeaders === 'function') res.flushHeaders()
    res.write(`retry: ${SSE_RETRY_MS}\n\n`)

    let closed = false
    const onClosed = () => {
      closed = true
    }
    request.raw.once('aborted', onClosed)
    request.raw.once('close', onClosed)

    const isStreamClosed = (): boolean =>
      closed || res.destroyed || res.writableEnded

    const writeSnapshot = (payload: unknown): void => {
      if (isStreamClosed()) return
      const body = JSON.stringify(payload)
      res.write(`event: snapshot\n`)
      res.write(`data: ${body}\n\n`)
    }

    let lastSnapshotEtag = ''
    try {
      const initial = await orchestrator.getWebUiSnapshot(
        SSE_DEFAULT_MESSAGE_LIMIT,
        SSE_DEFAULT_TASK_LIMIT,
      )
      lastSnapshotEtag = buildPayloadEtag('events', initial)
      writeSnapshot(initial)

      for (;;) {
        if (isStreamClosed()) break
        await orchestrator.waitForWebUiSignal(SSE_HEARTBEAT_MS)
        if (isStreamClosed()) break
        const snapshot = await orchestrator.getWebUiSnapshot(
          SSE_DEFAULT_MESSAGE_LIMIT,
          SSE_DEFAULT_TASK_LIMIT,
        )
        const snapshotEtag = buildPayloadEtag('events', snapshot)
        if (snapshotEtag === lastSnapshotEtag) continue

        lastSnapshotEtag = snapshotEtag
        writeSnapshot(snapshot)
      }
    } catch (error) {
      if (!isStreamClosed()) {
        const message = error instanceof Error ? error.message : String(error)
        res.write(`event: error\n`)
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`)
      }
    } finally {
      request.raw.off('aborted', onClosed)
      request.raw.off('close', onClosed)
      if (!isStreamClosed()) res.end()
    }
  })

  app.get('/api/status', (request, reply) => {
    const payload = orchestrator.getStatus()
    const etag = buildPayloadEtag('status', payload)
    reply.header('ETag', etag)
    if (matchesIfNoneMatch(request.headers['if-none-match'], etag)) {
      reply.code(304).send()
      return
    }
    return payload
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
    const etag = buildPayloadEtag('messages', payload)
    reply.header('ETag', etag)
    if (matchesIfNoneMatch(request.headers['if-none-match'], etag)) {
      reply.code(304).send()
      return
    }
    return payload
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
