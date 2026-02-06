import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import fastifyStatic from '@fastify/static'
import fastify from 'fastify'

import { logSafeError } from '../log/safe.js'

import { registerErrorHandler } from './error-handler.js'
import { resolveRoots } from './helpers.js'
import { registerApiRoutes, registerNotFoundHandler } from './routes-api.js'

import type { SupervisorConfig } from '../config.js'
import type { Supervisor } from '../supervisor/supervisor.js'

const MAX_BODY_BYTES = 64 * 1024

const registerStaticAssets = (
  app: ReturnType<typeof fastify>,
  config: SupervisorConfig,
): void => {
  const { webDir, markedDir, purifyDir } = resolveRoots()
  const generatedDir = resolve(config.stateDir, 'generated')
  mkdirSync(generatedDir, { recursive: true })

  app.register(fastifyStatic, {
    root: markedDir,
    prefix: '/vendor/marked/',
    decorateReply: false,
  })
  app.register(fastifyStatic, {
    root: purifyDir,
    prefix: '/vendor/purify/',
    decorateReply: false,
  })
  app.register(fastifyStatic, {
    root: generatedDir,
    prefix: '/artifacts/',
    decorateReply: false,
  })
  app.register(fastifyStatic, {
    root: webDir,
    prefix: '/',
    decorateReply: false,
  })
}

export const createHttpServer = (
  supervisor: Supervisor,
  config: SupervisorConfig,
  port: number,
) => {
  const app = fastify({ bodyLimit: MAX_BODY_BYTES })

  registerErrorHandler(app)
  registerApiRoutes(app, supervisor, config)
  registerNotFoundHandler(app)
  registerStaticAssets(app, config)

  void app
    .listen({ port, host: '0.0.0.0' })
    .then((address) => {
      console.log(`[http] listening on ${address}`)
    })
    .catch(async (error) => {
      await logSafeError('http: listen', error)
      process.exit(1)
    })

  return app
}
