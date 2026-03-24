import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import fastifyEtag from '@fastify/etag'
import fastifyStatic from '@fastify/static'
import fastify from 'fastify'
import { FastifySSEPlugin } from 'fastify-sse-v2'

import { logSafeError } from '../../persistence/log/safe.js'

import { ensureWebUiGenerated, resolveRoots } from './helpers.js'
import { registerApiRoutes, registerNotFoundHandler } from './routes-api.js'

import type { AppConfig } from '../../bootstrap/config.js'
import type { Orchestrator } from '../../kernel/orchestrator/orchestrator-service.js'
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from 'fastify'

const MAX_BODY_BYTES = 64 * 1024
const STATE_TASK_MARKDOWN_ROUTE =
  /^\/state-files\/(?:.*\/)?tasks\/.*\.(?:md|markdown)$/i

export const isStateTaskMarkdownPath = (pathname: string): boolean =>
  STATE_TASK_MARKDOWN_ROUTE.test(pathname)

export const buildStateTaskMarkdownViewerRedirect = (
  requestUrl: string,
): string | undefined => {
  const source = requestUrl.split('#', 1)[0] ?? requestUrl
  let query = ''
  const queryIndex = source.indexOf('?')
  if (queryIndex >= 0) query = source.slice(queryIndex + 1)
  if (new URLSearchParams(query).get('raw') === '1') return undefined
  const pathname = source.split('?', 1)[0] ?? source
  if (!isStateTaskMarkdownPath(pathname)) return undefined
  return `/archive-viewer.html?src=${encodeURIComponent(source)}`
}

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

const registerErrorHandler = (app: FastifyInstance): void => {
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

const registerStaticAssets = (
  app: ReturnType<typeof fastify>,
  config: AppConfig,
): void => {
  const { webDir } = resolveRoots()
  const stateDir = resolve(config.workDir)
  mkdirSync(stateDir, { recursive: true })

  app.addHook(
    'onRequest',
    (
      request: FastifyRequest,
      reply: FastifyReply,
      done: HookHandlerDoneFunction,
    ) => {
      if (request.method !== 'GET') {
        done()
        return
      }
      const rawUrl = request.raw.url ?? request.url
      const target = buildStateTaskMarkdownViewerRedirect(rawUrl)
      if (!target) {
        done()
        return
      }
      reply.redirect(target, 302)
      done()
    },
  )
  app.register(fastifyStatic, {
    root: stateDir,
    prefix: '/state-files/',
    decorateReply: false,
  })
  app.register(fastifyStatic, {
    root: webDir,
    prefix: '/',
    decorateReply: false,
  })
}

export const createHttpServer = async (
  orchestrator: Orchestrator,
  config: AppConfig,
  port: number,
) => {
  await ensureWebUiGenerated()
  const app = fastify({ bodyLimit: MAX_BODY_BYTES })
  await app.register(fastifyEtag)
  await app.register(FastifySSEPlugin, { retryDelay: 1500 })

  registerErrorHandler(app)
  registerApiRoutes(app, orchestrator, config)
  registerStaticAssets(app, config)
  registerNotFoundHandler(app)

  const address = await app.listen({ port, host: '0.0.0.0' })
  console.log(`[http] listening on ${address}`)

  return app
}
