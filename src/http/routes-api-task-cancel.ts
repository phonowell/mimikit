import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { FastifyInstance, FastifyReply } from 'fastify'

const resolveRouteId = (
  params: unknown,
  reply: FastifyReply,
  field: 'task',
): string | undefined => {
  const id =
    params && typeof params === 'object' && 'id' in params
      ? (params as { id?: unknown }).id
      : undefined
  const value = typeof id === 'string' ? id.trim() : ''
  if (value) return value
  reply.code(400).send({ error: `${field} id is required` })
  return undefined
}

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
