import { isVendorPath, serveStatic, serveVendor } from './static.js'
import { parseLimit, readBody, respond } from './utils.js'

import type { Supervisor } from '../supervisor/supervisor.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const handleRequest = async (
  supervisor: Supervisor,
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
    const id = await supervisor.addUserInput(text)
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
