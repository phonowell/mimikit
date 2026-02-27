import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { FastifyInstance } from 'fastify'
import { resolveRouteId } from './route-params.js'

export const registerTaskCancelRoute = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
): void => {
  app.post('/api/tasks/:id/cancel', async (request, reply) => {
    const taskId = resolveRouteId(request.params, reply, 'task')
    if (!taskId) return

    const result = await orchestrator.cancelTask(taskId, { source: 'user' })
    if (!result.ok) {
      if (result.status === 'not_found') {
        const canceledCron = await orchestrator.cancelCronJob(taskId)
        if (canceledCron) {
          reply.send({ ok: true, status: 'canceled', taskId })
          return
        }
      }
      const status =
        result.status === 'not_found'
          ? 404
          : result.status === 'invalid'
            ? 400
            : 409
      reply.code(status).send({ error: result.status })
      return
    }

    reply.send({ ok: true, status: result.status, taskId })
  })
}
