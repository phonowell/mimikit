import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import fastifyStatic from '@fastify/static'
import fastify from 'fastify'

import { logSafeError } from '../log/safe.js'

import type { SupervisorConfig } from '../config.js'
import type { Supervisor } from '../supervisor/supervisor.js'

const MAX_BODY_BYTES = 64 * 1024

const parseTaskLimit = (value: unknown): number => {
  const parsed = typeof value === 'string' ? Number(value) : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 200
  return Math.min(Math.floor(parsed), 500)
}

const parseMessageLimit = (value: unknown): number => {
  const parsed = typeof value === 'string' ? Number(value) : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 50
  return Math.floor(parsed)
}

const resolveRoots = () => {
  const __dirname = fileURLToPath(new URL('.', import.meta.url))
  const rootDir = resolve(__dirname, '..', '..')
  return {
    rootDir,
    webDir: resolve(__dirname, '..', 'webui'),
    markedDir: resolve(rootDir, 'node_modules', 'marked', 'lib'),
    purifyDir: resolve(rootDir, 'node_modules', 'dompurify', 'dist'),
  }
}

export const createHttpServer = (
  supervisor: Supervisor,
  _config: SupervisorConfig,
  port: number,
) => {
  void _config
  const app = fastify({ bodyLimit: MAX_BODY_BYTES })
  const { webDir, markedDir, purifyDir } = resolveRoots()

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
    const { body } = request
    if (!body || typeof body !== 'object') {
      reply.code(400).send({ error: 'invalid JSON' })
      return
    }
    const parsed = body as {
      text?: string
      clientTimeZone?: string
      clientOffsetMinutes?: number
      clientLocale?: string
      clientNowIso?: string
      language?: string
    }
    const text = parsed.text?.trim() ?? ''
    if (!text) {
      reply.code(400).send({ error: 'text is required' })
      return
    }
    const remote = request.raw.socket.remoteAddress ?? undefined
    const userAgent =
      typeof request.headers['user-agent'] === 'string'
        ? request.headers['user-agent']
        : undefined
    const acceptLanguage =
      typeof request.headers['accept-language'] === 'string'
        ? request.headers['accept-language']
        : undefined
    const bodyLanguage =
      typeof parsed.language === 'string' ? parsed.language : undefined
    const language = bodyLanguage ?? acceptLanguage
    const clientLocale =
      typeof parsed.clientLocale === 'string' ? parsed.clientLocale : undefined
    const clientTimeZone =
      typeof parsed.clientTimeZone === 'string'
        ? parsed.clientTimeZone
        : undefined
    const clientNowIso =
      typeof parsed.clientNowIso === 'string' ? parsed.clientNowIso : undefined
    const clientOffsetMinutes =
      typeof parsed.clientOffsetMinutes === 'number' &&
      Number.isFinite(parsed.clientOffsetMinutes)
        ? parsed.clientOffsetMinutes
        : undefined
    const id = await supervisor.addUserInput(text, {
      source: 'http',
      ...(remote ? { remote } : {}),
      ...(userAgent ? { userAgent } : {}),
      ...(language ? { language } : {}),
      ...(clientLocale ? { clientLocale } : {}),
      ...(clientTimeZone ? { clientTimeZone } : {}),
      ...(clientOffsetMinutes !== undefined ? { clientOffsetMinutes } : {}),
      ...(clientNowIso ? { clientNowIso } : {}),
    })
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
    const result = await supervisor.cancelTask(taskId, { source: 'http' })
    if (!result.ok) {
      const status =
        result.status === 'not_found'
          ? 404
          : result.status === 'invalid'
            ? 400
            : 409
      reply.code(status).send({ error: result.status })
      return
    }
    reply.send({ ok: true, status: result.status, taskId })
  })

  app.post('/api/restart', (_request, reply) => {
    reply.send({ ok: true })
    setTimeout(() => {
      supervisor.stop()
      process.exit(75)
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
    root: webDir,
    prefix: '/',
    decorateReply: false,
  })

  void app
    .listen({ port })
    .then((address) => {
      console.log(`[http] listening on ${address}`)
    })
    .catch(async (error) => {
      await logSafeError('http: listen', error)
      process.exit(1)
    })

  return app
}
