import type { FastifyReply } from 'fastify'

export const resolveRouteId = (
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
