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

export const registerApiRoutes = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
  _config: AppConfig,
): void => {
  app.get('/api/status', () => orchestrator.getStatus())

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

  app.get('/api/messages', async (request) => {
    const query = request.query as Record<string, unknown> | undefined
    const limit = parseMessageLimit(query?.limit)
    const messages = await orchestrator.getChatHistory(limit)
    return { messages }
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
