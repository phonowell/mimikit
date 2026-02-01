import { buildPaths } from '../fs/paths.js'
import { readRunLog } from '../log/run-log.js'

import { isVendorPath, serveStatic, serveVendor } from './static.js'
import { parseLimit, readBody, respond } from './utils.js'

import type { SupervisorConfig } from '../config.js'
import type { Supervisor } from '../supervisor/supervisor.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

const extractAuthToken = (req: IncomingMessage): string | null => {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7).trim()
  const alt =
    (typeof req.headers['x-mimikit-token'] === 'string'
      ? req.headers['x-mimikit-token']
      : Array.isArray(req.headers['x-mimikit-token'])
        ? req.headers['x-mimikit-token'][0]
        : null) ?? null
  const cleaned = alt?.trim()
  return cleaned && cleaned.length > 0 ? cleaned : null
}

const isAuthorized = (
  req: IncomingMessage,
  config: SupervisorConfig,
): boolean => {
  const { apiKey } = config.http
  if (!apiKey) return true
  const token = extractAuthToken(req)
  return token === apiKey
}

export const handleRequest = async (
  supervisor: Supervisor,
  config: SupervisorConfig,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const path = url.pathname

  if (path.startsWith('/api/')) {
    const allowStatus =
      path === '/api/status' && config.http.allowStatusWithoutAuth
    if (!allowStatus && !isAuthorized(req, config)) {
      await supervisor.logEvent({
        event: 'http_unauthorized',
        path,
        method: req.method,
        remote: req.socket.remoteAddress ?? null,
      })
      respond(res, 401, { error: 'unauthorized' })
      return
    }
  }

  if (path === '/api/status' && req.method === 'GET') {
    const status = await supervisor.getStatus()
    respond(res, 200, status)
    return
  }

  if (path === '/api/input' && req.method === 'POST') {
    const body = await readBody(req)
    let text: string
    try {
      const parsed = JSON.parse(body) as { text?: string }
      text = parsed.text?.trim() ?? ''
    } catch {
      respond(res, 400, { error: 'invalid JSON' })
      return
    }
    if (!text) {
      respond(res, 400, { error: 'text is required' })
      return
    }
    const remote = req.socket.remoteAddress ?? undefined
    const userAgent =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : undefined
    const id = await supervisor.addUserInput(text, {
      source: 'http',
      ...(remote ? { remote } : {}),
      ...(userAgent ? { userAgent } : {}),
    })
    respond(res, 200, { id })
    return
  }

  if (path === '/api/messages' && req.method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)
    const messages = await supervisor.getChatHistory(limit)
    respond(res, 200, { messages })
    return
  }

  if (path === '/api/tasks' && req.method === 'GET') {
    const limit = parseLimit(url.searchParams.get('limit'))
    const data = await supervisor.getTasks(limit)
    respond(res, 200, data)
    return
  }

  if (path === '/api/runs' && req.method === 'GET') {
    const kind = url.searchParams.get('kind')
    const id = url.searchParams.get('id')
    if (!kind || !id || (kind !== 'task' && kind !== 'trigger')) {
      respond(res, 400, { error: 'kind=task|trigger and id required' })
      return
    }
    const limit = parseLimit(url.searchParams.get('limit'))
    const paths = buildPaths(config.stateDir)
    const dir = kind === 'task' ? paths.taskRuns : paths.triggerRuns
    const entries = await readRunLog(dir, id, { limit })
    respond(res, 200, { entries })
    return
  }

  if (path === '/api/restart' && req.method === 'POST') {
    respond(res, 200, { ok: true })
    setTimeout(() => {
      supervisor.stop()
      process.exit(75)
    }, 100)
    return
  }

  if (req.method === 'GET' && isVendorPath(path)) {
    await serveVendor(res, path)
    return
  }

  if (req.method === 'GET') {
    const filePath = path === '/' ? '/index.html' : path
    await serveStatic(res, filePath)
    return
  }

  respond(res, 404, { error: 'not found' })
}
