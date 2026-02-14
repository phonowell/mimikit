import { dirname } from 'node:path'

import read from 'fire-keeper/read'
import pRetry from 'p-retry'
import writeFileAtomicLib from 'write-file-atomic'

import { safe } from '../log/safe.js'

import { ensureDir, ensureFile } from './paths.js'

const parseJsonRaw = <T>(
  raw: unknown,
  fallback: T,
  meta: { path: string },
): T | Promise<T> => {
  if (!raw) return fallback
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw as T
  const text =
    typeof raw === 'string'
      ? raw
      : Buffer.isBuffer(raw)
        ? raw.toString('utf8')
        : ''
  if (!text.trim()) return fallback
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

const toJsonText = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`

export const readJson = async <T>(
  path: string,
  fallback: T,
  opts?: { ensureFile?: boolean },
): Promise<T> => {
  const readRaw = () =>
    safe('readJson: readFile', () => read(path, { raw: true, echo: false }), {
      fallback: null,
      meta: { path },
      ignoreCodes: ['ENOENT'],
    })

  let raw = await readRaw()
  if (!raw && opts?.ensureFile) {
    await ensureFile(path, toJsonText(fallback))
    raw = await readRaw()
  }

  return parseJsonRaw(raw, fallback, { path })
}

export const writeJson = async (
  path: string,
  value: unknown,
): Promise<void> => {
  const raw = JSON.stringify(value, null, 2)
  await writeFileAtomic(path, `${raw}\n`)
}
