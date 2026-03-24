import { readFile } from 'node:fs/promises'

export const readTextFileIfExists = async (path: string): Promise<string> => {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return ''
    throw error
  }
}

export const readJson = async <T>(path: string, fallback: T): Promise<T> => {
  const text = await readTextFileIfExists(path)
  if (!text.trim()) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}
