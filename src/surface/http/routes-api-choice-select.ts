import { z } from 'zod'

import { parseBodyWithSchema, resolveRouteId } from './route-params.js'

import type { Orchestrator } from '../../kernel/orchestrator/orchestrator-service.js'
import type { FastifyInstance } from 'fastify'

const selectChoiceBodySchema = z
  .object({
    optionId: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z.string().min(1),
    ),
  })
  .strict()

export const registerChoiceSelectRoute = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
): void => {
  app.post('/api/choices/:id/select', async (request, reply) => {
    const choiceId = resolveRouteId(request.params, reply, 'choice')
    if (!choiceId) return

    const parsedBody = parseBodyWithSchema(request.body, selectChoiceBodySchema)
    if (!parsedBody) {
      reply.code(400).send({ error: 'optionId is required' })
      return
    }

    const result = await orchestrator.selectPendingUserChoice(
      choiceId,
      parsedBody.optionId,
    )
    if (!result.ok) {
      if (result.reason === 'not_found') {
        reply.code(404).send({ error: 'choice not found' })
        return
      }
      if (result.reason === 'invalid_option') {
        reply.code(400).send({ error: 'invalid option' })
        return
      }
      reply.code(409).send({ error: 'choice expired' })
      return
    }

    reply.send({
      ok: true,
      choiceId: result.choiceId,
      optionId: result.optionId,
      source: result.source,
    })
  })
}
