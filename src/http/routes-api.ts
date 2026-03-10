import { logSafeError } from '../log/safe.js'

import { clearStateDir, parseInputBody } from './helpers.js'
import { resolveRouteId } from './route-params.js'
import { registerChoiceSelectRoute } from './routes-api-choice-select.js'
import { registerEventsRoute } from './routes-api-events.js'
import { registerTaskArchiveRoute } from './routes-api-task-archive.js'
import { registerTaskMutationRoute } from './routes-api-task-mutation.js'

import type { AppConfig } from '../config.js'
import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { FastifyInstance, FastifyReply } from 'fastify'

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
  const taskMutationRoutes = [
    {
      path: '/api/tasks/:id/cancel',
      mutateTask: (taskId: string) =>
        orchestrator.cancelTask(taskId, { source: 'user' }),
    },
    {
      path: '/api/tasks/:id/delete',
      mutateTask: (taskId: string) =>
        orchestrator.deleteTask(taskId, { source: 'user' }),
    },
    {
      path: '/api/tasks/:id/pause',
      mutateTask: (taskId: string) =>
        orchestrator.pauseTask(taskId, { source: 'user' }),
    },
    {
      path: '/api/tasks/:id/resume',
      mutateTask: (taskId: string) =>
        orchestrator.resumeTask(taskId, { source: 'user' }),
    },
  ] as const
  for (const route of taskMutationRoutes)
    registerTaskMutationRoute(app, route.path, route.mutateTask)

  app.post('/api/tasks/resume-recoverable', async (_request, reply) => {
    reply.send(await orchestrator.resumeRecoverableTasks())
  })
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

  const isRuntimeIdleForControlAction = (): boolean => {
    const status = orchestrator.getStatus()
    return (
      status.managerRunning === false &&
      status.activeTasks === 0 &&
      status.pendingTasks === 0
    )
  }

  const rejectWhenBusy = (
    reply: FastifyReply,
    action: 'restart' | 'reset',
  ): boolean => {
    if (isRuntimeIdleForControlAction()) return false
    reply.code(409).send({
      error: `${action} requires clear slots: wait for manager to stop and pending/running tasks to clear`,
    })
    return true
  }

  const clearStateDirSafely = async (reason: string): Promise<void> => {
    try {
      await clearStateDir(config.workDir)
    } catch (error) {
      await logSafeError(reason, error)
    }
  }

  app.post('/api/restart', (_request, reply) => {
    if (rejectWhenBusy(reply, 'restart')) return
    reply.send({ ok: true })
    scheduleExit()
  })

  app.post('/api/reset', (_request, reply) => {
    if (rejectWhenBusy(reply, 'reset')) return
    reply.send({ ok: true })
    scheduleExit({
      exitReason: 'http_api_reset',
      afterPersist: () => clearStateDirSafely('http: reset'),
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
