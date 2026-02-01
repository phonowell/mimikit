import { createServer } from 'node:net'

import type { Usage } from './types.js'

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const nowIso = () => new Date().toISOString()

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const toInt = (value: string | undefined, fallback: number) => {
  const trimmed = value?.trim()
  if (!trimmed) return fallback
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const sumUsage = (target: Usage, next?: Usage) => {
  if (!next) return
  if (Number.isFinite(next.input ?? NaN))
    target.input = (target.input ?? 0) + (next.input ?? 0)
  if (Number.isFinite(next.output ?? NaN))
    target.output = (target.output ?? 0) + (next.output ?? 0)
  if (Number.isFinite(next.total ?? NaN))
    target.total = (target.total ?? 0) + (next.total ?? 0)
}

export const truncate = (text: string, max = 400) => {
  if (text.length <= max) return text
  if (max <= 3) return text.slice(0, max)
  return `${text.slice(0, max - 3)}...`
}

export const getFreePort = async (): Promise<number> => {
  return await new Promise((resolvePort, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (!addr || typeof addr === 'string') {
        srv.close()
        reject(new Error('failed to acquire free port'))
        return
      }
      const port = addr.port
      srv.close((err) => {
        if (err) reject(err)
        else resolvePort(port)
      })
    })
  })
}

export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> => {
  let timer: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
