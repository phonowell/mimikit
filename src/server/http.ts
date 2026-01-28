import http from 'node:http'
import { URL } from 'node:url'

import { loadWebUiAsset } from './webui.js'

import type { ResumePolicy } from '../config.js'
import type { Master } from '../runtime/master.js'

export type HttpServerOptions = {
  port: number
  master: Master
}

const sendJson = (
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void => {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

const sendText = (
  res: http.ServerResponse,
  status: number,
  body: string,
  contentType: string,
  headers?: Record<string, string>,
): void => {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    ...(headers ?? {}),
  })
  res.end(body)
}
const logResponse = (
  req: http.IncomingMessage,
  url: URL,
  status: number,
  startedAt: number,
  detail?: string,
): void => {
  const method = req.method ?? 'UNKNOWN'
  const durationMs = Date.now() - startedAt
  const base = `${method} ${url.pathname} ${status} ${durationMs}ms`
  const line = detail ? `${base} ${detail}` : base
  if (status >= 400) console.error(line)
  else console.log(line)
}

const shouldLog = (req: http.IncomingMessage, url: URL): boolean =>
  !(req.method === 'GET' && url.pathname === '/health')
const readJson = async (req: http.IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = []
  for await (const chunk of req)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))

  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return {}
  return JSON.parse(raw) as unknown
}

const isResumePolicy = (value: unknown): value is ResumePolicy =>
  value === 'auto' || value === 'always' || value === 'never'

export const startHttpServer = async (
  options: HttpServerOptions,
): Promise<http.Server> => {
  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now()
    const url = new URL(
      req.url ?? '/',
      `http://${req.headers.host ?? 'localhost'}`,
    )
    const respond = (status: number, body: unknown, detail?: string): void => {
      sendJson(res, status, body)
      if (shouldLog(req, url)) logResponse(req, url, status, startedAt, detail)
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      respond(200, options.master.getStats())
      return
    }

    if (req.method === 'GET') {
      try {
        const asset = await loadWebUiAsset(url.pathname)
        if (asset) {
          sendText(res, 200, asset.body, asset.contentType, {
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
          })
          return
        }
      } catch {
        sendText(
          res,
          500,
          'Failed to load web UI asset',
          'text/plain; charset=utf-8',
        )
        return
      }
    }

    if (req.method === 'GET' && url.pathname === '/sessions') {
      const sessions = options.master.listSessions().map((session) => ({
        sessionKey: session.sessionKey,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        summary: session.summary ?? '',
      }))
      respond(200, { sessions }, `sessions=${sessions.length}`)
      return
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/sessions/')) {
      const sessionKey = decodeURIComponent(
        url.pathname.slice('/sessions/'.length),
      ).trim()
      if (!sessionKey) {
        respond(
          400,
          { error: 'sessionKey is required' },
          'error=missing_session',
        )
        return
      }
      try {
        const result = await options.master.deleteSession(sessionKey)
        if (!result.ok) {
          if (result.reason === 'active_tasks') {
            respond(
              409,
              { error: 'session has active tasks' },
              'error=active_tasks',
            )
            return
          }
          if (result.reason === 'not_found') {
            respond(404, { error: 'Session not found' }, 'error=not_found')
            return
          }
          respond(400, { error: 'Invalid session' }, 'error=invalid_session')
          return
        }
        respond(200, { ok: true }, `session=${sessionKey}`)
        return
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        respond(500, { error: message }, 'error=session_delete_failed')
        return
      }
    }

    if (req.method === 'POST' && url.pathname === '/tasks') {
      try {
        const body = await readJson(req)
        if (!body || typeof body !== 'object') {
          respond(400, { error: 'Invalid JSON' }, 'error=invalid_json')
          return
        }
        const record = body as {
          sessionKey?: unknown
          prompt?: unknown
          resume?: unknown
          verifyCommand?: unknown
          maxIterations?: unknown
        }
        if (
          typeof record.sessionKey !== 'string' ||
          typeof record.prompt !== 'string'
        ) {
          respond(
            400,
            { error: 'sessionKey and prompt are required' },
            'error=missing_fields',
          )
          return
        }
        const resume = isResumePolicy(record.resume) ? record.resume : undefined
        const verifyCommand =
          typeof record.verifyCommand === 'string'
            ? record.verifyCommand
            : undefined
        const maxIterations =
          typeof record.maxIterations === 'number' &&
          Number.isFinite(record.maxIterations) &&
          record.maxIterations >= 1
            ? Math.floor(record.maxIterations)
            : undefined
        const request: {
          sessionKey: string
          prompt: string
          resume?: ResumePolicy
          verifyCommand?: string
          maxIterations?: number
        } = {
          sessionKey: record.sessionKey,
          prompt: record.prompt,
        }
        if (resume !== undefined) request.resume = resume
        if (verifyCommand !== undefined) request.verifyCommand = verifyCommand
        if (maxIterations !== undefined) request.maxIterations = maxIterations

        const task = await options.master.enqueueTask(request)
        respond(200, task, `task=${task.id}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        respond(400, { error: message }, 'error=invalid_request')
      }
      return
    }

    if (req.method === 'GET' && url.pathname.startsWith('/tasks/')) {
      const id = decodeURIComponent(url.pathname.slice('/tasks/'.length))
      const task = options.master.getTask(id)
      if (!task) {
        respond(404, { error: 'Task not found' }, `task=${id}`)
        return
      }
      respond(200, task, `task=${id}`)
      return
    }

    respond(404, { error: 'Not found' }, 'error=not_found')
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, () => resolve())
  })

  return server
}
