import { basename, dirname } from 'node:path'

import { createStream, type RotatingFileStream } from 'rotating-file-stream'

import { ensureDir } from '../fs/ensure.js'
import { nowIso } from '../time.js'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_BYTES = 500 * 1024 * 1024
const MAX_FILES = Math.max(1, Math.ceil(MAX_TOTAL_BYTES / MAX_BYTES))

const streams = new Map<string, RotatingFileStream>()

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

export const appendLog = async (
  path: string,
  entry: Record<string, unknown>,
): Promise<void> => {
  const stream = await getStream(path)
  const line = `${JSON.stringify({ timestamp: nowIso(), ...entry })}\n`
  await writeLine(stream, line)
}
