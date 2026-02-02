import { isVendorPath, serveStatic, serveVendor } from './static.js'
import { parseLimit, readBody, respond } from './utils.js'

import type { SupervisorConfig } from '../config.js'
import type { Supervisor } from '../supervisor/supervisor.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const handleRequest = async (
  supervisor: Supervisor,
  _config: SupervisorConfig,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const path = url.pathname

  if (path === '/api/status' && req.method === 'GET') {
    const status = await supervisor.getStatus()
    respond(res, 200, status)
    return
  }

  if (path === '/api/input' && req.method === 'POST') {
    const body = await readBody(req)
    let text: string
    let clientTimeZone: string | undefined
    let clientOffsetMinutes: number | undefined
    let clientLocale: string | undefined
    let clientNowIso: string | undefined
    let bodyLanguage: string | undefined
    try {
      const parsed = JSON.parse(body) as {
        text?: string
        clientTimeZone?: string
        clientOffsetMinutes?: number
        clientLocale?: string
        clientNowIso?: string
        language?: string
      }
      text = parsed.text?.trim() ?? ''
      clientTimeZone =
        typeof parsed.clientTimeZone === 'string'
          ? parsed.clientTimeZone
          : undefined
      clientOffsetMinutes =
        typeof parsed.clientOffsetMinutes === 'number' &&
        Number.isFinite(parsed.clientOffsetMinutes)
          ? parsed.clientOffsetMinutes
          : undefined
      clientLocale =
        typeof parsed.clientLocale === 'string'
          ? parsed.clientLocale
          : undefined
      clientNowIso =
        typeof parsed.clientNowIso === 'string'
          ? parsed.clientNowIso
          : undefined
      bodyLanguage =
        typeof parsed.language === 'string' ? parsed.language : undefined
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
    const acceptLanguage =
      typeof req.headers['accept-language'] === 'string'
        ? req.headers['accept-language']
        : undefined
    const language = bodyLanguage ?? acceptLanguage
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
