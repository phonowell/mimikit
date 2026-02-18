import { createReadStream } from 'node:fs'
import { appendFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

import { writeFileAtomic } from '../fs/json.js'
import { ensureDir, ensureFile } from '../fs/paths.js'
import { logSafeError, safe } from '../log/safe.js'

import { runSerialized } from './serialized-lock.js'

type JsonlReadOptions<T> = {
  validate?: (value: unknown) => T | undefined | null
}

const require = createRequire(import.meta.url)
const jsonlParserFactory = require('stream-json/jsonl/Parser') as {
  parser: (options?: {
    errorIndicator?: (error: unknown, input: string) => unknown
  }) => NodeJS.ReadWriteStream
}

export const toUtf8Text = (raw: unknown): string => {
  if (typeof raw === 'string') return raw
  if (Buffer.isBuffer(raw)) return raw.toString('utf8')
  return ''
}

const readJsonlValues = async (path: string): Promise<unknown[]> => {
  const parserErrors: Array<{ error: unknown; line: string }> = []
  const values: unknown[] = []
  await new Promise<void>((resolve, reject) => {
    const source = createReadStream(path, { encoding: 'utf8' })
    const parser = jsonlParserFactory.parser({
      errorIndicator: (error, input) => {
        parserErrors.push({ error, line: String(input) })
        return undefined
      },
    })
    source.once('error', reject)
    parser.once('error', reject)
    parser.once('end', resolve)
    parser.on('data', (chunk: unknown) => {
      if (!chunk || typeof chunk !== 'object') return
      const { value } = chunk as { value?: unknown }
      if (value === undefined) return
      values.push(value)
    })
    source.pipe(parser)
  })
  for (const item of parserErrors) {
    await logSafeError('readJsonl: parse', item.error, {
      meta: { path, line: item.line },
    })
  }
  return values
}

export const readJsonl = async <T>(
  path: string,
  options: JsonlReadOptions<T> & { ensureFile?: boolean } = {},
): Promise<T[]> => {
  if (options.ensureFile) await ensureFile(path, '')

  const values = await safe('readJsonl: stream', () => readJsonlValues(path), {
    fallback: [],
    meta: { path },
    ignoreCodes: ['ENOENT'],
  })
  if (values.length === 0) return []
  const items: T[] = []
  for (const value of values) {
    const normalized = options.validate ? options.validate(value) : (value as T)
    if (normalized !== undefined && normalized !== null) items.push(normalized)
  }
  return items
}

export const writeJsonl = async <T>(
  path: string,
  items: T[],
): Promise<void> => {
  const body = items.map((item) => JSON.stringify(item)).join('\n')
  const payload = body.length > 0 ? `${body}\n` : ''
  await writeFileAtomic(path, payload)
}

export const appendJsonl = async <T>(
  path: string,
  items: T[],
): Promise<void> => {
  if (items.length === 0) return
  await ensureDir(dirname(path))
  const body = items.map((item) => JSON.stringify(item)).join('\n')
  const payload = `${body}\n`
  await appendFile(path, payload, { encoding: 'utf8' })
}

export const updateJsonl = <T>(
  path: string,
  updater: (items: T[]) => T[] | Promise<T[]>,
): Promise<T[]> =>
  runSerialized(path, async () => {
    const current = await readJsonl<T>(path)
    const next = await updater([...current])
    await writeJsonl(path, next)
    return next
  })
