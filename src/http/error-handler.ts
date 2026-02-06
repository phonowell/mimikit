import { logSafeError } from '../log/safe.js'

import type { FastifyInstance } from 'fastify'

const resolveStatusCode = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || !error) return undefined
  if (!('statusCode' in error)) return undefined
  const { statusCode } = error as { statusCode?: unknown }
  return typeof statusCode === 'number' ? statusCode : undefined
}

const resolveErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || !error) return undefined
  if (!('code' in error)) return undefined
  const { code } = error as { code?: unknown }
  return typeof code === 'string' ? code : undefined
}

export const registerErrorHandler = (app: FastifyInstance): void => {
  app.setErrorHandler(async (error, _request, reply) => {
    const statusCode = resolveStatusCode(error)
    const code = resolveErrorCode(error)
    if (code === 'FST_ERR_CTP_INVALID_JSON_BODY') {
      reply.code(400).send({ error: 'invalid JSON' })
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      reply.code(statusCode).send({ error: message })
      return
    }
    await logSafeError('http: request', error)
    reply.code(500).send({ error: message })
  })
}
