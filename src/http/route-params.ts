import type { FastifyReply } from 'fastify'
import type { ZodType } from 'zod'

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
  errorMessage?: string,
): string | undefined => {
  const id = readRouteParamId(params)
  if (id) return id
  reply.code(400).send({ error: errorMessage ?? `${field} id is required` })
  return undefined
}

export const parseBodyWithSchema = <T>(
  body: unknown,
  schema: ZodType<T>,
): T | undefined => {
  const parsed = schema.safeParse(body)
  if (!parsed.success) return undefined
  return parsed.data
}
