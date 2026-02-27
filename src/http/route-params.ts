import type { FastifyReply } from 'fastify'

const readRouteParamId = (params: unknown): string | undefined => {
  const id =
    params && typeof params === 'object' && 'id' in params
      ? (params as { id?: unknown }).id
      : undefined
  const value = typeof id === 'string' ? id.trim() : ''
  return value || undefined
}

export const resolveRouteId = (
  params: unknown,
  reply: FastifyReply,
  field: string,
): string | undefined => {
  const id = readRouteParamId(params)
  if (id) return id
  reply.code(400).send({ error: `${field} id is required` })
  return undefined
}
