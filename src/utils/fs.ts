import fs from 'node:fs/promises'
import path from 'node:path'

export const ensureDir = async (dirPath: string): Promise<void> => {
  await fs.mkdir(dirPath, { recursive: true })
}

export const readJsonFile = async <T>(
  filePath: string,
  fallback: T,
): Promise<T> => {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return fallback
    throw error
  }
}

export const writeJsonFile = async (
  filePath: string,
  data: unknown,
): Promise<void> => {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
}

export const appendFile = async (
  filePath: string,
  content: string,
): Promise<void> => {
  await ensureDir(path.dirname(filePath))
  await fs.appendFile(filePath, content, 'utf8')
}
