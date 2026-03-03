import { assertEnabledQqConfig, registerQqWebhookRoute } from '../channels/qq/index.js'
import { logSafeError } from '../log/safe.js'

import { clearStateDir, parseInputBody } from './helpers.js'
import { registerChoiceSelectRoute } from './routes-api-choice-select.js'
import { registerEventsRoute } from './routes-api-events.js'
import { registerTaskArchiveRoute } from './routes-api-task-archive.js'
import { registerTaskCancelRoute } from './routes-api-task-cancel.js'

import type { AppConfig } from '../config.js'
import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { FastifyInstance } from 'fastify'

export const registerApiRoutes = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
  config: AppConfig,
): void => {
  registerEventsRoute(app, orchestrator)
  if (config.qq.enabled) {
    assertEnabledQqConfig(config.qq)
    registerQqWebhookRoute(app, orchestrator, config)
  }

  app.get('/api/status', (_request, reply) =>
    reply.send(orchestrator.getStatus()),
  )

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

  app.delete('/api/messages/:id', async (request, reply) => {
    const params = request.params as { id?: unknown }
    const id = typeof params.id === 'string' ? params.id.trim() : ''
    if (!id) {
      reply.code(400).send({ error: 'id is required' })
      return
    }
    const result = await orchestrator.deleteChatMessage(id)
    if (!result.ok) {
      if (result.reason === 'not_allowed') {
        reply.code(400).send({ error: 'system message cannot be deleted' })
        return
      }
      reply.code(404).send({ error: 'message not found' })
      return
    }
    reply.send(result)
  })

  registerTaskArchiveRoute(app, orchestrator, config)
  registerTaskCancelRoute(app, orchestrator)
  registerChoiceSelectRoute(app, orchestrator)

  const scheduleExit = (params?: {
    afterPersist?: () => Promise<void>
    exitReason?: string
  }): void => {
    setTimeout(() => {
      void (async () => {
        await orchestrator.stopAndPersist()
        if (params?.afterPersist) await params.afterPersist()
        orchestrator.requestExit(75, params?.exitReason ?? 'http_api_restart')
      })()
    }, 100)
  }

  app.post('/api/restart', (_request, reply) => {
    reply.send({ ok: true })
    scheduleExit()
  })

  app.post('/api/reset', (_request, reply) => {
    reply.send({ ok: true })
    scheduleExit({
      exitReason: 'http_api_reset',
      afterPersist: async () => {
        try {
          await clearStateDir(config.workDir)
        } catch (error) {
          await logSafeError('http: reset', error)
        }
      },
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
