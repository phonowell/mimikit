import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import pRetry from 'p-retry'
import writeFileAtomicLib from 'write-file-atomic'

import { toPrettyJsonText } from '../../foundation/shared/json.js'
import { safe } from '../log/safe.js'

import { ensureDir, ensureFile } from './paths.js'

const parseJsonRaw = <T>(
  raw: unknown,
  fallback: T,
  meta: { path: string },
  options?: { quietParseError?: boolean },
): Promise<T> => {
  if (!raw) return Promise.resolve(fallback)
  if (typeof raw === 'object' && !Buffer.isBuffer(raw))
    return Promise.resolve(raw as T)
  const text =
    typeof raw === 'string'
      ? raw
      : Buffer.isBuffer(raw)
        ? raw.toString('utf8')
        : ''
  if (!text.trim()) return Promise.resolve(fallback)
  if (options?.quietParseError) {
    try {
      return Promise.resolve(JSON.parse(text) as T)
    } catch {
      return Promise.resolve(fallback)
    }
  }
  return safe('readJson: parse', () => JSON.parse(text) as T, {
    fallback,
    meta,
  })
}

export const writeFileAtomic = async (
  path: string,
  content: string,
): Promise<void> => {
  await ensureDir(dirname(path))
  const isRetryableFsError = (error: unknown): boolean => {
    if (!error || typeof error !== 'object' || !('code' in error)) return false
    const code = String((error as { code?: string }).code)
    return (
      code === 'EPERM' ||
      code === 'EACCES' ||
      code === 'EBUSY' ||
      code === 'EMFILE' ||
      code === 'ENFILE'
    )
  }
  await pRetry(() => writeFileAtomicLib(path, content, { encoding: 'utf8' }), {
    retries: 5,
    factor: 2,
    minTimeout: 20,
    maxTimeout: 600,
    randomize: true,
    shouldRetry: ({ error }) => isRetryableFsError(error),
  })
}

export const readJson = async <T>(
  path: string,
  fallback: T,
  opts?: { ensureFile?: boolean; quietParseError?: boolean },
): Promise<T> => {
  const readRaw = () =>
    safe('readJson: readFile', () => readFile(path), {
      fallback: null,
      meta: { path },
      ignoreCodes: ['ENOENT'],
    })

  let raw = await readRaw()
  if (!raw && opts?.ensureFile) {
    await ensureFile(path, toPrettyJsonText(fallback))
    raw = await readRaw()
  }

  return parseJsonRaw(raw, fallback, { path }, opts)
}

export const writeJson = (path: string, value: unknown): Promise<void> =>
  writeFileAtomic(path, toPrettyJsonText(value))
