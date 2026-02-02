import { readFile } from 'node:fs/promises'

import { safe } from '../log/safe.js'

import { writeFileAtomic } from './atomic.js'

export const readJson = async <T>(
  path: string,
  fallback: T,
  opts?: { useBackup?: boolean },
): Promise<T> => {
  const raw = await safe('readJson: readFile', () => readFile(path, 'utf8'), {
    fallback: null,
    meta: { path },
    ignoreCodes: ['ENOENT'],
  })
  if (raw !== null) {
    return safe('readJson: parse', () => JSON.parse(raw) as T, {
      fallback,
      meta: { path },
    })
  }
  if (opts?.useBackup === false) return fallback
  const backupPath = `${path}.bak`
  const backupRaw = await safe(
    'readJson: readFile backup',
    () => readFile(backupPath, 'utf8'),
    { fallback: null, meta: { path: backupPath }, ignoreCodes: ['ENOENT'] },
  )
  if (backupRaw !== null) {
    return safe('readJson: parse backup', () => JSON.parse(backupRaw) as T, {
      fallback,
      meta: { path: backupPath },
    })
  }
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
