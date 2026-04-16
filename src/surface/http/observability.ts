/**
 * @file HTTP observability helpers.
 * @description Records structured Fastify request, control-plane, and server lifecycle events into the shared JSONL log.
 */

import { buildPaths } from '../../persistence/fs/paths.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

const HTTP_REQUEST_STARTED_AT = Symbol('mimikit.http_request_started_at')

type TimedFastifyRequest = FastifyRequest & {
  [HTTP_REQUEST_STARTED_AT]?: bigint
}

const toTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const toHeaderNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

const resolveUrl = (request: FastifyRequest): string =>
  request.raw.url ?? request.url

const resolvePathname = (request: FastifyRequest): string =>
  resolveUrl(request).split('?', 1)[0] ?? request.url

const resolveRouteKind = (request: FastifyRequest): string => {
  const pathname = resolvePathname(request)
  if (pathname === '/api/events') return 'sse'
  if (pathname.startsWith('/api/')) return 'api'
  if (pathname.startsWith('/state-files/')) return 'state_file'
  return 'static'
}

const resolveRoutePath = (request: FastifyRequest): string | undefined => {
  const routeOptions = request.routeOptions as { url?: unknown } | undefined
  return toTrimmedString(routeOptions?.url)
}

const resolveDurationMs = (request: FastifyRequest): number | undefined => {
  const startedAt = (request as TimedFastifyRequest)[HTTP_REQUEST_STARTED_AT]
  if (typeof startedAt !== 'bigint') return undefined
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000
}

const buildRequestContext = (
  request: FastifyRequest,
  reply?: FastifyReply,
): Record<string, unknown> => {
  const routePath = resolveRoutePath(request)
  const userAgent = toTrimmedString(request.headers['user-agent'])
  const requestBytes = toHeaderNumber(request.headers['content-length'])
  const durationMs = reply ? resolveDurationMs(request) : undefined
  const responseBytes = reply
    ? toHeaderNumber(reply.getHeader('content-length'))
    : undefined
  const contentType = reply
    ? toTrimmedString(reply.getHeader('content-type'))
    : undefined
  return {
    requestId: request.id,
    method: request.method,
    url: resolveUrl(request),
    pathname: resolvePathname(request),
    routeKind: resolveRouteKind(request),
    ...(routePath ? { routePath } : {}),
    ...(request.ip ? { remoteAddress: request.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(requestBytes !== undefined ? { requestBytes } : {}),
    ...(reply ? { statusCode: reply.statusCode } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(responseBytes !== undefined ? { responseBytes } : {}),
    ...(contentType ? { contentType } : {}),
  }
}

export const appendHttpLog = async (
  stateDir: string,
  entry: Record<string, unknown>,
): Promise<void> => {
  await bestEffort(`appendLog: ${String(entry['event'] ?? 'http')}`, () =>
    appendLog(buildPaths(stateDir).log, entry),
  )
}

export const buildHttpRequestContext = buildRequestContext

export const registerHttpObservability = (
  app: FastifyInstance,
  stateDir: string,
): void => {
  app.addHook('onRequest', (request, _reply, done) => {
    ;(request as TimedFastifyRequest)[HTTP_REQUEST_STARTED_AT] =
      process.hrtime.bigint()
    done()
  })

  app.addHook('onResponse', async (request, reply) => {
    await appendHttpLog(stateDir, {
      event: 'http_request_completed',
      ...buildRequestContext(request, reply),
    })
  })
}
