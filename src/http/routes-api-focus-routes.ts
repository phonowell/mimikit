import { resolveRouteId } from './routes-api-route-id.js'

import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { FastifyInstance } from 'fastify'

const toFocusErrorStatus = (status: string): number =>
  status === 'not_found' ? 404 : 409

export const registerFocusRoutes = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
): void => {
  app.get('/api/focuses', () => orchestrator.getFocuses())

  app.post('/api/focuses/:id/expire', async (request, reply) => {
    const focusId = resolveRouteId(request.params, reply, 'focus')
    if (!focusId) return
    const result = await orchestrator.expireFocus(focusId)
    if (!result.ok) {
      reply
        .code(toFocusErrorStatus(result.status))
        .send({ error: result.status })
      return
    }
    reply.send({ ok: true, status: result.status, focusId })
  })

  app.post('/api/focuses/:id/restore', async (request, reply) => {
    const focusId = resolveRouteId(request.params, reply, 'focus')
    if (!focusId) return
    const result = await orchestrator.restoreFocus(focusId)
    if (!result.ok) {
      reply
        .code(toFocusErrorStatus(result.status))
        .send({ error: result.status })
      return
    }
    reply.send({ ok: true, status: result.status, focusId })
  })
}
