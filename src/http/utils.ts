import type { IncomingMessage, ServerResponse } from 'node:http'

export const respond = (
  res: ServerResponse,
  status: number,
  data: unknown,
): void => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

const MAX_BODY_BYTES = 64 * 1024

export const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
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

export const parseLimit = (value: string | null): number => {
  const parsed = value ? Number(value) : NaN
  if (!Number.isFinite(parsed) || parsed <= 0) return 200
  return Math.min(Math.floor(parsed), 500)
}
