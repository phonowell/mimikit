import { dirname } from 'node:path'

import copy from 'fire-keeper/copy'
import read from 'fire-keeper/read'
import writeFileAtomicLib from 'write-file-atomic'

import { logSafeError, safe } from '../log/safe.js'

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

const readErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object' || !('code' in error))
    return undefined
  const { code } = error as { code?: unknown }
  if (typeof code === 'string' && code) return code
  if (typeof code === 'number') return String(code)
  return undefined
}

const inspectBackupError = (
  error: unknown,
): { ignorable: boolean; codes: string[] } => {
  if (error instanceof AggregateError) {
    const nested = error.errors.map((item) => inspectBackupError(item))
    if (nested.length === 0) return { ignorable: false, codes: [] }
    return {
      ignorable: nested.every((item) => item.ignorable),
      codes: nested.flatMap((item) => item.codes),
    }
  }
  const code = readErrorCode(error)
  if (!code) return { ignorable: false, codes: [] }
  return { ignorable: code === 'ENOENT', codes: [code] }
}

export const writeFileAtomic = async (
  path: string,
  content: string,
  opts?: { backup?: boolean },
): Promise<void> => {
  await ensureDir(dirname(path))
  if (opts?.backup) {
    try {
      await copy(path, `${path}.bak`)
    } catch (error) {
      const inspected = inspectBackupError(error)
      if (!inspected.ignorable) {
        await logSafeError('writeFileAtomic: backup', error, {
          meta:
            inspected.codes.length > 0
              ? { path, codes: inspected.codes }
              : { path },
        })
        throw error
      }
    }
  }
  await writeFileAtomicLib(path, content, { encoding: 'utf8' })
}

const toJsonText = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`

export const readJson = async <T>(
  path: string,
  fallback: T,
  opts?: { useBackup?: boolean; ensureFile?: boolean },
): Promise<T> => {
  const readRaw = () =>
    safe('readJson: readFile', () => read(path, { raw: true }), {
      fallback: null,
      meta: { path },
      ignoreCodes: ['ENOENT'],
    })

  let raw = await readRaw()
  if (!raw && opts?.ensureFile) {
    await ensureFile(path, toJsonText(fallback))
    raw = await readRaw()
  }

  const parsed = await parseJsonRaw(raw, fallback, { path })
  if (parsed !== fallback) return parsed
  if (opts?.useBackup === false) return fallback
  const backupPath = `${path}.bak`
  const backupRaw = await safe(
    'readJson: readFile backup',
    () => read(backupPath, { raw: true }),
    { fallback: null, meta: { path: backupPath }, ignoreCodes: ['ENOENT'] },
  )
  const parsedBackup = await parseJsonRaw(backupRaw, fallback, {
    path: backupPath,
  })
  if (parsedBackup !== fallback) return parsedBackup
  return fallback
}

export const writeJson = async (
  path: string,
  value: unknown,
  opts?: { backup?: boolean },
): Promise<void> => {
  const raw = JSON.stringify(value, null, 2)
  await writeFileAtomic(path, `${raw}\n`, { backup: opts?.backup ?? true })
}
