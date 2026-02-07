import { parseInputBody, parseMessageLimit, parseTaskLimit } from './helpers.js'
import {
  registerControlRoutes,
  registerMessagesExportRoute,
  registerTaskArchiveRoute,
  registerTaskCancelRoute,
} from './routes-api-sections.js'

import type { SupervisorConfig } from '../config.js'
import type { Supervisor } from '../supervisor/supervisor.js'
import type { FastifyInstance } from 'fastify'

export const registerApiRoutes = (
  app: FastifyInstance,
  supervisor: Supervisor,
  _config: SupervisorConfig,
): void => {
  app.get('/api/status', () => supervisor.getStatus())

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
    const id = await supervisor.addUserInput(
      result.text,
      result.meta,
      result.quote,
    )
    reply.send({ id })
  })

  app.post('/api/evolve/code', async (request, reply) => {
    const remote = request.raw.socket.remoteAddress ?? undefined
    const { id } = await supervisor.recordCodeEvolveRemovedTrigger(
      remote ? { remote } : undefined,
    )
    reply.code(410).send({
      ok: false,
      error: 'evaluation pipeline removed',
      id,
    })
  })

  app.get('/api/messages', async (request) => {
    const query = request.query as Record<string, unknown> | undefined
    const limit = parseMessageLimit(query?.limit)
    const messages = await supervisor.getChatHistory(limit)
    return { messages }
  })

  registerMessagesExportRoute(app, supervisor)

  app.get('/api/tasks', (request) => {
    const query = request.query as Record<string, unknown> | undefined
    const limit = parseTaskLimit(query?.limit)
    return supervisor.getTasks(limit)
  })

  registerTaskArchiveRoute(app, supervisor, _config)
  registerTaskCancelRoute(app, supervisor)
  registerControlRoutes(app, supervisor, _config)
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
