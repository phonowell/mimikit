import { readFile } from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Supervisor } from './supervisor.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
}

export function createHttpServer(supervisor: Supervisor, port: number) {
  const server = createServer(async (req, res) => {
    try {
      await handleRequest(supervisor, req, res)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      respond(res, 500, { error: message })
    }
  })

  server.listen(port, () => {
    console.log(`[http] listening on http://localhost:${port}`)
  })

  return server
}

async function handleRequest(
  supervisor: Supervisor,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const path = url.pathname

  // API Routes
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

  if (path === '/api/restart' && req.method === 'POST') {
    respond(res, 200, { ok: true })
    setTimeout(() => {
      supervisor.stop()
      process.exit(75)
    }, 100)
    return
  }

  // Static files (WebUI)
  if (req.method === 'GET') {
    const filePath = path === '/' ? '/index.html' : path
    await serveStatic(res, filePath)
    return
  }

  respond(res, 404, { error: 'not found' })
}

function respond(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

async function serveStatic(
  res: ServerResponse,
  filePath: string,
): Promise<void> {
  const webDir = join(__dirname, 'webui')
  const fullPath = join(webDir, filePath)

  // Security: ensure path is within webui directory
  if (!fullPath.startsWith(webDir)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  try {
    const content = await readFile(fullPath)
    const ext = extname(filePath)
    const mime = MIME_TYPES[ext] ?? 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': mime })
    res.end(content)
  } catch {
    res.writeHead(404)
    res.end('Not Found')
  }
}

const MAX_BODY_BYTES = 64 * 1024

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    let bytes = 0
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        req.destroy()
        reject(new Error('body too large'))
        return
      }
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}
