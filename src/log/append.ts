import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { basename, dirname } from 'node:path'

import mkdir from 'fire-keeper/mkdir'
import pino, { type Logger } from 'pino'
import { createStream, type RotatingFileStream } from 'rotating-file-stream'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_BYTES = 500 * 1024 * 1024
const MAX_FILES = Math.max(1, Math.ceil(MAX_TOTAL_BYTES / MAX_BYTES))

type LoggerBundle = {
  logger: Logger
  stream: RotatingFileStream
}

const loggers = new Map<string, LoggerBundle>()

const ensureDir = async (path: string): Promise<void> => {
  await mkdir(path, { echo: false })
}

const buildBundle = async (path: string): Promise<LoggerBundle> => {
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
  const logger = pino(
    {
      base: { schema: 'mimikit.log.v2' },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    stream,
  )
  return { logger, stream }
}

const getBundle = async (path: string): Promise<LoggerBundle> => {
  const existing = loggers.get(path)
  if (existing) return existing
  const bundle = await buildBundle(path)
  loggers.set(path, bundle)
  return bundle
}

const flushIfNeeded = async (stream: RotatingFileStream): Promise<void> => {
  if (!stream.writableNeedDrain) return
  await once(stream, 'drain')
}

const normalizeStringList = (value: unknown): string | undefined => {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .join(',')
  return normalized || undefined
}

const deriveTraceSeed = (entry: Record<string, unknown>): string => {
  const { traceId: explicit, taskId, inputIds, resultIds } = entry
  if (typeof explicit === 'string' && explicit.trim().length > 0)
    return explicit.trim()
  if (typeof taskId === 'string' && taskId.trim().length > 0)
    return `task:${taskId.trim()}`
  const normalizedInputIds = normalizeStringList(inputIds)
  if (normalizedInputIds) return `inputs:${normalizedInputIds}`
  const normalizedResultIds = normalizeStringList(resultIds)
  if (normalizedResultIds) return `results:${normalizedResultIds}`
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
  const { logger, stream } = await getBundle(path)
  const level = resolveLevel(entry)
  const traceId = deriveTraceId(entry)
  const { level: _ignoredLevel, ...payload } = entry
  logger[level]({
    traceId,
    ...payload,
  })
  await flushIfNeeded(stream)
}
