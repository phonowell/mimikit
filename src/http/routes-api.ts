import { createHash } from 'node:crypto'

import { logSafeError } from '../log/safe.js'
import { clearStateDir, parseInputBody } from './helpers.js'
import {
  registerTaskArchiveRoute,
  registerTaskCancelRoute,
} from './routes-api-task-routes.js'

import type { AppConfig } from '../config.js'
import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { UiAgentStream } from '../orchestrator/core/runtime-state.js'
import type { TokenUsage } from '../types/index.js'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

const comparableEtag = (value: string): string =>
  value.trim().replace(/^W\//, '')

const matchesIfNoneMatch = (ifNoneMatch: unknown, etag: string): boolean => {
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

const buildPayloadEtag = (prefix: string, payload: unknown): string => {
  const digest = createHash('sha1')
    .update(JSON.stringify(payload))
    .digest('base64url')
  return `W/"${prefix}-${digest}"`
}

const replyWithEtag = <TPayload>(params: {
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

const SSE_HEARTBEAT_MS = 15_000
const SSE_RETRY_MS = 1_500
const getDefaultSnapshot = (orchestrator: Orchestrator) =>
  orchestrator.getWebUiSnapshot()

const buildSnapshotHint = (orchestrator: Orchestrator) => ({
  status: orchestrator.getStatus(),
  tasks: orchestrator.getTasks(),
  todos: orchestrator.getTodos(),
  stream: cloneUiStream(orchestrator.getWebUiStreamSnapshot()),
})

type StreamPatch =
  | { mode: 'clear' }
  | { mode: 'replace'; stream: UiAgentStream }
  | {
      mode: 'delta'
      id: string
      delta: string
      updatedAt: string
      usage?: TokenUsage | null
    }

const cloneUiStream = (stream: UiAgentStream | null): UiAgentStream | null =>
  stream
    ? {
        ...stream,
        ...(stream.usage ? { usage: { ...stream.usage } } : {}),
      }
    : null

const usageKey = (usage?: TokenUsage): string =>
  usage ? JSON.stringify(usage) : ''

const buildStreamPatch = (
  prev: UiAgentStream | null,
  next: UiAgentStream | null,
): StreamPatch | null => {
  if (!next) return prev ? { mode: 'clear' } : null
  if (!prev) return { mode: 'replace', stream: next }
  if (prev.id !== next.id) return { mode: 'replace', stream: next }
  if (!next.text.startsWith(prev.text)) return { mode: 'replace', stream: next }
  const delta = next.text.slice(prev.text.length)
  const usageChanged = usageKey(prev.usage) !== usageKey(next.usage)
  if (!delta && !usageChanged) return null
  return {
    mode: 'delta',
    id: next.id,
    delta,
    updatedAt: next.updatedAt,
    ...(usageChanged ? { usage: next.usage ?? null } : {}),
  }
}

const createSseStream = (request: FastifyRequest, reply: FastifyReply) => {
  reply.hijack()
  const response = reply.raw
  response.statusCode = 200
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  response.setHeader('Cache-Control', 'no-cache, no-transform')
  response.setHeader('Connection', 'keep-alive')
  response.setHeader('X-Accel-Buffering', 'no')
  response.socket?.setNoDelay(true)
  if (typeof response.flushHeaders === 'function') response.flushHeaders()
  response.write(`retry: ${SSE_RETRY_MS}\n\n`)

  let closed = false
  const markClosed = () => {
    closed = true
  }
  request.raw.once('aborted', markClosed)
  request.raw.once('close', markClosed)

  const isClosed = (): boolean =>
    closed || response.destroyed || response.writableEnded

  return {
    isClosed,
    writeEvent: (event: string, payload: unknown): boolean => {
      if (isClosed()) return false
      const wrote = response.write(
        `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`,
      )
      const { flush } = response as { flush?: () => void }
      if (typeof flush === 'function') flush.call(response)
      return wrote
    },
    cleanup: () => {
      request.raw.off('aborted', markClosed)
      request.raw.off('close', markClosed)
      if (!isClosed()) response.end()
    },
  }
}

export const registerApiRoutes = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
  config: AppConfig,
): void => {
  app.get('/api/events', async (request, reply) => {
    const stream = createSseStream(request, reply)
    let lastSnapshotEtag = ''
    let lastSnapshotHintEtag = ''
    let lastStream = cloneUiStream(null)
    try {
      const initial = await getDefaultSnapshot(orchestrator)
      lastSnapshotEtag = buildPayloadEtag('events', initial)
      lastSnapshotHintEtag = buildPayloadEtag('events:hint', {
        status: initial.status,
        tasks: initial.tasks,
        todos: initial.todos,
        stream: initial.stream,
      })
      lastStream = cloneUiStream(initial.stream)
      stream.writeEvent('snapshot', initial)

      for (;;) {
        if (stream.isClosed()) break
        const signal = await orchestrator.waitForWebUiSignal(SSE_HEARTBEAT_MS)
        if (stream.isClosed()) break
        if (signal === 'timeout') continue
        if (signal === 'stream') {
          const nextStream = cloneUiStream(
            orchestrator.getWebUiStreamSnapshot(),
          )
          const patch = buildStreamPatch(lastStream, nextStream)
          if (!patch) continue
          lastStream = nextStream
          if (!stream.writeEvent('stream', patch)) break
          continue
        }
        const snapshotHint = buildSnapshotHint(orchestrator)
        const snapshotHintEtag = buildPayloadEtag('events:hint', snapshotHint)
        if (snapshotHintEtag === lastSnapshotHintEtag) continue
        const snapshot = await getDefaultSnapshot(orchestrator)
        const snapshotEtag = buildPayloadEtag('events', snapshot)
        if (snapshotEtag === lastSnapshotEtag) {
          lastSnapshotHintEtag = snapshotHintEtag
          continue
        }
        lastSnapshotHintEtag = snapshotHintEtag
        lastSnapshotEtag = snapshotEtag
        lastStream = cloneUiStream(snapshot.stream)
        if (!stream.writeEvent('snapshot', snapshot)) break
      }
    } catch (error) {
      stream.writeEvent('error', {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      stream.cleanup()
    }
  })

  app.get('/api/status', (request, reply) =>
    replyWithEtag({
      request,
      reply,
      prefix: 'status',
      payload: orchestrator.getStatus(),
    }),
  )

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
    const id = await orchestrator.addUserInput(
      result.text,
      result.meta,
      result.quote,
    )
    reply.send({ id })
  })

  registerTaskArchiveRoute(app, orchestrator, config)
  registerTaskCancelRoute(app, orchestrator)

  const scheduleExit = (afterPersist?: () => Promise<void>): void => {
    setTimeout(() => {
      void (async () => {
        await orchestrator.stopAndPersist()
        if (afterPersist) await afterPersist()
        process.exit(75)
      })()
    }, 100)
  }

  app.post('/api/restart', (_request, reply) => {
    reply.send({ ok: true })
    scheduleExit()
  })

  app.post('/api/reset', (_request, reply) => {
    reply.send({ ok: true })
    scheduleExit(async () => {
      try {
        await clearStateDir(config.workDir)
      } catch (error) {
        await logSafeError('http: reset', error)
      }
    })
  })
}

export const registerNotFoundHandler = (app: FastifyInstance): void => {
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET') {
      reply.code(404).type('text/plain').send('Not Found')
      return
    }
    reply.code(404).send({ error: 'not found' })
  })
}
