import http from 'node:http'
import { URL } from 'node:url'

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
    const url = new URL(
      req.url ?? '/',
      `http://${req.headers.host ?? 'localhost'}`,
    )

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && url.pathname === '/tasks') {
      try {
        const body = await readJson(req)
        if (!body || typeof body !== 'object') {
          sendJson(res, 400, { error: 'Invalid JSON' })
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
          sendJson(res, 400, { error: 'sessionKey and prompt are required' })
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
        sendJson(res, 200, task)
      } catch (error) {
        sendJson(res, 400, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return
    }

    if (req.method === 'GET' && url.pathname.startsWith('/tasks/')) {
      const id = decodeURIComponent(url.pathname.slice('/tasks/'.length))
      const task = options.master.getTask(id)
      if (!task) {
        sendJson(res, 404, { error: 'Task not found' })
        return
      }
      sendJson(res, 200, task)
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, () => resolve())
  })

  return server
}
