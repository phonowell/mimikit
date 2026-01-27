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
): void => {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
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
      respond(200, { ok: true })
      return
    }

    if (req.method === 'GET' && url.pathname === '/stats') {
      try {
        const stats = await options.master.getMetricsSummary()
        respond(200, stats)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        respond(500, { error: message }, 'error=stats_failed')
      }
      return
    }

    if (req.method === 'GET') {
      try {
        const asset = await loadWebUiAsset(url.pathname)
        if (asset) {
          sendText(res, 200, asset.body, asset.contentType)
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
          scoreCommand?: unknown
          minScore?: unknown
          objective?: unknown
          maxIterations?: unknown
          guardRequireClean?: unknown
          guardMaxChangedFiles?: unknown
          guardMaxChangedLines?: unknown
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
        const scoreCommand =
          typeof record.scoreCommand === 'string'
            ? record.scoreCommand
            : undefined
        const minScore =
          typeof record.minScore === 'number' &&
          Number.isFinite(record.minScore)
            ? record.minScore
            : undefined
        const objective =
          typeof record.objective === 'string' ? record.objective : undefined
        const maxIterations =
          typeof record.maxIterations === 'number' &&
          Number.isFinite(record.maxIterations) &&
          record.maxIterations >= 1
            ? Math.floor(record.maxIterations)
            : undefined
        const guardRequireClean =
          typeof record.guardRequireClean === 'boolean'
            ? record.guardRequireClean
            : undefined
        const guardMaxChangedFiles =
          typeof record.guardMaxChangedFiles === 'number' &&
          Number.isFinite(record.guardMaxChangedFiles) &&
          record.guardMaxChangedFiles >= 0
            ? Math.floor(record.guardMaxChangedFiles)
            : undefined
        const guardMaxChangedLines =
          typeof record.guardMaxChangedLines === 'number' &&
          Number.isFinite(record.guardMaxChangedLines) &&
          record.guardMaxChangedLines >= 0
            ? Math.floor(record.guardMaxChangedLines)
            : undefined
        const request: {
          sessionKey: string
          prompt: string
          resume?: ResumePolicy
          verifyCommand?: string
          scoreCommand?: string
          minScore?: number
          objective?: string
          maxIterations?: number
          guardRequireClean?: boolean
          guardMaxChangedFiles?: number
          guardMaxChangedLines?: number
        } = {
          sessionKey: record.sessionKey,
          prompt: record.prompt,
        }
        if (resume !== undefined) request.resume = resume
        if (verifyCommand !== undefined) request.verifyCommand = verifyCommand
        if (scoreCommand !== undefined) request.scoreCommand = scoreCommand
        if (minScore !== undefined) request.minScore = minScore
        if (objective !== undefined) request.objective = objective
        if (maxIterations !== undefined) request.maxIterations = maxIterations
        if (guardRequireClean !== undefined)
          request.guardRequireClean = guardRequireClean
        if (guardMaxChangedFiles !== undefined)
          request.guardMaxChangedFiles = guardMaxChangedFiles
        if (guardMaxChangedLines !== undefined)
          request.guardMaxChangedLines = guardMaxChangedLines

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
