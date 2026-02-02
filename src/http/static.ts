import { readFile } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { safe } from '../log/safe.js'

import type { ServerResponse } from 'node:http'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = resolve(__dirname, '..', '..')

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
}

const VENDOR_FILES: Record<string, string> = {
  '/vendor/marked.js': resolve(
    rootDir,
    'node_modules/marked/lib/marked.esm.js',
  ),
  '/vendor/purify.js': resolve(
    rootDir,
    'node_modules/dompurify/dist/purify.es.mjs',
  ),
}

export const isVendorPath = (path: string): boolean => path in VENDOR_FILES

export const serveStatic = async (
  res: ServerResponse,
  filePath: string,
): Promise<void> => {
  const webDir = join(__dirname, '..', 'webui')
  const safePath = filePath.replace(/^\/+/, '')
  const fullPath = resolve(webDir, safePath)
  const rel = relative(webDir, fullPath)

  if (rel.startsWith('..') || rel.startsWith(sep)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  const content = await safe(
    'serveStatic: readFile',
    () => readFile(fullPath),
    { fallback: null, meta: { filePath: fullPath }, ignoreCodes: ['ENOENT'] },
  )
  if (!content) {
    res.writeHead(404)
    res.end('Not Found')
    return
  }
  const ext = extname(filePath)
  const mime = MIME_TYPES[ext] ?? 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': mime })
  res.end(content)
}

export const serveVendor = async (
  res: ServerResponse,
  path: string,
): Promise<void> => {
  const filePath = VENDOR_FILES[path]
  if (!filePath) {
    res.writeHead(404)
    res.end('Not Found')
    return
  }
  const content = await safe(
    'serveVendor: readFile',
    () => readFile(filePath),
    {
      fallback: null,
      meta: { filePath },
      ignoreCodes: ['ENOENT'],
    },
  )
  if (!content) {
    res.writeHead(404)
    res.end('Not Found')
    return
  }
  const ext = extname(filePath)
  const mime = MIME_TYPES[ext] ?? 'application/javascript'
  res.writeHead(200, { 'Content-Type': mime })
  res.end(content)
}
