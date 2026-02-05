import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import fastifyStatic from '@fastify/static'
import fastify from 'fastify'

import { logSafeError } from '../log/safe.js'

import {
  clearStateDir,
  parseInputBody,
  parseMessageLimit,
  parseTaskLimit,
  resolveRoots,
} from './helpers.js'

import type { SupervisorConfig } from '../config.js'
import type { Supervisor } from '../supervisor/supervisor.js'

const MAX_BODY_BYTES = 64 * 1024

export const createHttpServer = (
  supervisor: Supervisor,
  config: SupervisorConfig,
  port: number,
) => {
  const app = fastify({ bodyLimit: MAX_BODY_BYTES })
  const { webDir, markedDir, purifyDir } = resolveRoots()
  const generatedDir = resolve(config.stateDir, 'generated')
  mkdirSync(generatedDir, { recursive: true })

  app.setErrorHandler(async (error, _request, reply) => {
    const statusCode =
      typeof (error as { statusCode?: number }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : undefined
    const code =
      typeof (error as { code?: string }).code === 'string'
        ? (error as { code: string }).code
        : undefined
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

  app.get('/api/status', () => supervisor.getStatus())

  app.post('/api/input', async (request, reply) => {
    const result = parseInputBody(request.body, {
      remoteAddress: request.raw.socket.remoteAddress ?? undefined,
      userAgent:
        typeof request.headers['user-agent'] === 'string'
          ? request.headers['user-agent']
          : undefined,
      acceptLanguage:
        typeof request.headers['accept-language'] === 'string'
          ? request.headers['accept-language']
          : undefined,
    })
    if ('error' in result) {
      reply.code(400).send({ error: result.error })
      return
    }
    const id = await supervisor.addUserInput(
      result.text,
      result.meta,
      result.quote,
    )
    reply.send({ id })
  })

  app.get('/api/messages', async (request) => {
    const query = request.query as Record<string, unknown> | undefined
    const limit = parseMessageLimit(query?.limit)
    const messages = await supervisor.getChatHistory(limit)
    return { messages }
  })

  app.get('/api/tasks', (request) => {
    const query = request.query as Record<string, unknown> | undefined
    const limit = parseTaskLimit(query?.limit)
    return supervisor.getTasks(limit)
  })

  app.post('/api/tasks/:id/cancel', async (request, reply) => {
    const params = request.params as { id?: string } | undefined
    const taskId = typeof params?.id === 'string' ? params.id.trim() : ''
    if (!taskId) {
      reply.code(400).send({ error: 'task id is required' })
      return
    }
    const cancelResult = await supervisor.cancelTask(taskId, { source: 'http' })
    if (!cancelResult.ok) {
      const status =
        cancelResult.status === 'not_found'
          ? 404
          : cancelResult.status === 'invalid'
            ? 400
            : 409
      reply.code(status).send({ error: cancelResult.status })
      return
    }
    reply.send({ ok: true, status: cancelResult.status, taskId })
  })

  app.post('/api/restart', (_request, reply) => {
    reply.send({ ok: true })
    setTimeout(() => {
      supervisor.stop()
      process.exit(75)
    }, 100)
  })

  app.post('/api/reset', (_request, reply) => {
    reply.send({ ok: true })
    setTimeout(() => {
      void (async () => {
        supervisor.stop()
        try {
          await clearStateDir(config.stateDir)
        } catch (error) {
          await logSafeError('http: reset', error)
        }
        process.exit(75)
      })()
    }, 100)
  })

  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET') {
      reply.code(404).type('text/plain').send('Not Found')
      return
    }
    reply.code(404).send({ error: 'not found' })
  })

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
