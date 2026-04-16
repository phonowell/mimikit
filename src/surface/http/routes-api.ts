import { parseInputBody } from './input-body.js'
import { resolveRouteId } from './route-params.js'
import { registerEventsRoute } from './routes-api-events.js'
import { registerRuntimeControlRoutes } from './routes-api-runtime-control.js'
import { registerTaskArchiveRoute } from './routes-api-task-archive.js'
import { registerTaskMutationRoute } from './routes-api-task-mutation.js'
import { registerWorkspaceFileRoute } from './routes-api-workspace-file.js'

import type { AppConfig } from '../../bootstrap/config.js'
import type { Orchestrator } from '../../kernel/orchestrator/orchestrator-service.js'
import type { FastifyInstance } from 'fastify'

export const registerApiRoutes = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
  config: AppConfig,
): void => {
  registerEventsRoute(app, orchestrator)

  app.get('/api/status', (_request, reply) =>
    reply.send(orchestrator.getStatus()),
  )

  app.post('/api/input', async (request, reply) => {
    const result = parseInputBody(request.body, {
      remoteAddress: request.raw.socket.remoteAddress ?? undefined,
      requestId: request.id,
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
    const id = resolveRouteId(
      request.params,
      reply,
      'message',
      'id is required',
    )
    if (!id) return
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
  registerWorkspaceFileRoute(app, config)
  const taskMutationRoutes = [
    {
      path: '/api/tasks/:id/cancel',
      action: 'cancel',
    },
    {
      path: '/api/tasks/:id/delete',
      action: 'delete',
    },
    {
      path: '/api/tasks/:id/pause',
      action: 'pause',
    },
    {
      path: '/api/tasks/:id/resume',
      action: 'resume',
    },
  ] as const
  for (const route of taskMutationRoutes) {
    registerTaskMutationRoute(app, route.path, (taskId: string) =>
      orchestrator.mutateTask(route.action, taskId, { source: 'user' }),
    )
  }
  registerRuntimeControlRoutes(app, orchestrator, config)
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
