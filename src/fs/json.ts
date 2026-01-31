import { readFile } from 'node:fs/promises'

import { writeFileAtomic } from './atomic.js'

export const readJson = async <T>(path: string, fallback: T): Promise<T> => {
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export const writeJson = async (
  path: string,
  value: unknown,
): Promise<void> => {
  const raw = JSON.stringify(value, null, 2)
  await writeFileAtomic(path, `${raw}\n`)
}
