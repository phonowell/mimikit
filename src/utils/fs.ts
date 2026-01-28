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

export const writeJsonFileAtomic = async (
  filePath: string,
  data: unknown,
): Promise<void> => {
  const dir = path.dirname(filePath)
  await ensureDir(dir)
  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  )
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tempPath, filePath)
}

export const writeFileAtomic = async (
  filePath: string,
  content: string,
): Promise<void> => {
  const dir = path.dirname(filePath)
  await ensureDir(dir)
  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  )
  await fs.writeFile(tempPath, content, 'utf8')
  await fs.rename(tempPath, filePath)
}

export const appendFile = async (
  filePath: string,
  content: string,
): Promise<void> => {
  await ensureDir(path.dirname(filePath))
  await fs.appendFile(filePath, content, 'utf8')
}
