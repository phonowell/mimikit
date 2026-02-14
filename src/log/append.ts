import { createHash } from 'node:crypto'
import { basename, dirname } from 'node:path'

import mkdir from 'fire-keeper/mkdir'
import { createStream, type RotatingFileStream } from 'rotating-file-stream'

import { nowIso } from '../shared/utils.js'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_BYTES = 500 * 1024 * 1024
const MAX_FILES = Math.max(1, Math.ceil(MAX_TOTAL_BYTES / MAX_BYTES))

const streams = new Map<string, RotatingFileStream>()

const ensureDir = async (path: string): Promise<void> => {
  await mkdir(path, { echo: false })
}

const buildStream = async (path: string): Promise<RotatingFileStream> => {
  const dir = dirname(path)
  await ensureDir(dir)
  const stream = createStream(basename(path), {
    size: `${Math.floor(MAX_BYTES / (1024 * 1024))}M`,
    interval: '1d',
    path: dir,
    compress: 'gzip',
    maxFiles: MAX_FILES,
  })
  stream.on('error', (error) => {
    console.error('[log] stream error', error)
  })
  return stream
}

const getStream = async (path: string): Promise<RotatingFileStream> => {
  const existing = streams.get(path)
  if (existing) return existing
  const stream = await buildStream(path)
  streams.set(path, stream)
  return stream
}

const writeLine = (stream: RotatingFileStream, line: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const onDrain = () => {
      cleanup()
      resolve()
    }
    const cleanup = () => {
      stream.off('error', onError)
      stream.off('drain', onDrain)
    }
    stream.on('error', onError)
    const ok = stream.write(line, 'utf8')
    if (ok) {
      cleanup()
      resolve()
      return
    }
    stream.on('drain', onDrain)
  })

const deriveTraceSeed = (entry: Record<string, unknown>): string => {
  const { traceId: explicit, taskId, inputIds, resultIds } = entry
  if (typeof explicit === 'string' && explicit.trim().length > 0)
    return explicit.trim()
  if (typeof taskId === 'string' && taskId.trim().length > 0)
    return `task:${taskId.trim()}`
  if (Array.isArray(inputIds) && inputIds.length > 0) {
    const normalized = inputIds
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .join(',')
    if (normalized) return `inputs:${normalized}`
  }
  if (Array.isArray(resultIds) && resultIds.length > 0) {
    const normalized = resultIds
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .join(',')
    if (normalized) return `results:${normalized}`
  }
  return JSON.stringify(entry)
}

const deriveTraceId = (entry: Record<string, unknown>): string =>
  createHash('sha1').update(deriveTraceSeed(entry)).digest('hex').slice(0, 16)

const resolveLevel = (
  entry: Record<string, unknown>,
): 'info' | 'warn' | 'error' => {
  const explicit = entry['level']
  if (explicit === 'info' || explicit === 'warn' || explicit === 'error')
    return explicit
  const event = typeof entry['event'] === 'string' ? entry['event'] : ''
  if (event === 'error') return 'error'
  if (/fail|cancel|retry|timeout|invalid|abort|fallback/i.test(event))
    return 'warn'
  return 'info'
}

export const appendLog = async (
  path: string,
  entry: Record<string, unknown>,
): Promise<void> => {
  const stream = await getStream(path)
  const timestamp = nowIso()
  const level = resolveLevel(entry)
  const traceId = deriveTraceId(entry)
  const line = `${JSON.stringify({
    timestamp,
    schema: 'mimikit.log.v2',
    level,
    traceId,
    ...entry,
  })}\n`
  await writeLine(stream, line)
}
