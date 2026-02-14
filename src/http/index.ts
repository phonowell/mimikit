import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import fastifyStatic from '@fastify/static'
import fastify from 'fastify'

import { registerErrorHandler } from './error-handler.js'
import { resolveRoots } from './helpers.js'
import { registerApiRoutes, registerNotFoundHandler } from './routes-api.js'

import type { AppConfig } from '../config.js'
import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'

const MAX_BODY_BYTES = 64 * 1024

const registerStaticAssets = (
  app: ReturnType<typeof fastify>,
  config: AppConfig,
): void => {
  const { webDir, markedDir, purifyDir } = resolveRoots()
  const generatedDir = resolve(config.workDir, 'generated')
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

export const createHttpServer = async (
  orchestrator: Orchestrator,
  config: AppConfig,
  port: number,
) => {
  const app = fastify({ bodyLimit: MAX_BODY_BYTES })

  registerErrorHandler(app)
  registerApiRoutes(app, orchestrator, config)
  registerNotFoundHandler(app)
  registerStaticAssets(app, config)

  const address = await app.listen({ port, host: '0.0.0.0' })
  console.log(`[http] listening on ${address}`)

  return app
}
