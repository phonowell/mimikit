import { createHash } from 'node:crypto'

import { parseInputBody, parseMessageLimit, parseTaskLimit } from './helpers.js'
import {
  registerControlRoutes,
  registerMessagesExportRoute,
  registerTaskArchiveRoute,
  registerTaskCancelRoute,
  registerTaskProgressRoute,
} from './routes-api-sections.js'

import type { AppConfig } from '../config.js'
import type { Orchestrator } from '../orchestrator/orchestrator.js'
import type { FastifyInstance } from 'fastify'

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

  registerMessagesExportRoute(app, orchestrator)

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
