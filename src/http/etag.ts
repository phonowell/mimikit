import { createHash } from 'node:crypto'

import type { FastifyReply, FastifyRequest } from 'fastify'

const comparableEtag = (value: string): string =>
  value.trim().replace(/^W\//, '')

export const matchesIfNoneMatch = (
  ifNoneMatch: unknown,
  etag: string,
): boolean => {
  if (typeof ifNoneMatch !== 'string') return false
  const candidates = ifNoneMatch
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (candidates.includes('*')) return true
  const normalizedEtag = comparableEtag(etag)
  return candidates.some(
    (candidate) => comparableEtag(candidate) === normalizedEtag,
  )
}

export const buildPayloadEtag = (prefix: string, payload: unknown): string => {
  const digest = createHash('sha1')
    .update(JSON.stringify(payload))
    .digest('base64url')
  return `W/"${prefix}-${digest}"`
}

export const replyWithEtag = <TPayload>(params: {
  request: FastifyRequest
  reply: FastifyReply
  prefix: string
  payload: TPayload
}): TPayload | undefined => {
  const etag = buildPayloadEtag(params.prefix, params.payload)
  params.reply.header('ETag', etag)
  if (matchesIfNoneMatch(params.request.headers['if-none-match'], etag)) {
    params.reply.code(304).send()
    return undefined
  }
  return params.payload
}
