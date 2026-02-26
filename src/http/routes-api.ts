import { logSafeError } from '../log/safe.js'
import { clearStateDir, parseInputBody } from './helpers.js'
import { registerEventsRoute } from './routes-api-events.js'
import {
  registerTaskArchiveRoute,
  registerTaskCancelRoute,
} from './routes-api-task-routes.js'

import type { AppConfig } from '../config.js'
import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { FastifyInstance } from 'fastify'

export const registerApiRoutes = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
  config: AppConfig,
): void => {
  registerEventsRoute(app, orchestrator)

  app.get('/api/status', (_request, reply) => reply.send(orchestrator.getStatus()))

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

  registerTaskArchiveRoute(app, orchestrator, config)
  registerTaskCancelRoute(app, orchestrator)

  const scheduleExit = (afterPersist?: () => Promise<void>): void => {
    setTimeout(() => {
      void (async () => {
        await orchestrator.stopAndPersist()
        if (afterPersist) await afterPersist()
        process.exit(75)
      })()
    }, 100)
  }

  app.post('/api/restart', (_request, reply) => {
    reply.send({ ok: true })
    scheduleExit()
  })

  app.post('/api/reset', (_request, reply) => {
    reply.send({ ok: true })
    scheduleExit(async () => {
      try {
        await clearStateDir(config.workDir)
      } catch (error) {
        await logSafeError('http: reset', error)
      }
    })
  })
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
