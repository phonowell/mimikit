import { z } from 'zod'

import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
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
    const params = request.params as { id?: unknown }
    const choiceId = typeof params.id === 'string' ? params.id.trim() : ''
    if (!choiceId) {
      reply.code(400).send({ error: 'choice id is required' })
      return
    }

    const parsedBody = selectChoiceBodySchema.safeParse(request.body)
    if (!parsedBody.success) {
      reply.code(400).send({ error: 'optionId is required' })
      return
    }

    const result = await orchestrator.selectPendingUserChoice(
      choiceId,
      parsedBody.data.optionId,
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
