import fs from 'node:fs/promises'
import path from 'node:path'

import { isErrnoException } from '../utils/error.js'

type LockInfo = {
  pid: number
  ts: number
}

const writeLock = async (lockPath: string): Promise<void> => {
  const handle = await fs.open(lockPath, 'wx')
  try {
    const info: LockInfo = { pid: process.pid, ts: Date.now() }
    await handle.writeFile(JSON.stringify(info), 'utf8')
  } finally {
    await handle.close()
  }
}

const readLock = async (lockPath: string): Promise<LockInfo | null> => {
  try {
    const raw = await fs.readFile(lockPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<LockInfo>
    if (typeof parsed.ts !== 'number') return null
    return {
      pid: typeof parsed.pid === 'number' ? parsed.pid : -1,
      ts: parsed.ts,
    }
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return null
    return null
  }
}

export const acquireLock = async (
  targetPath: string,
  timeoutMs = 30_000,
): Promise<() => Promise<void>> => {
  const lockPath = `${targetPath}.lock`
  await fs.mkdir(path.dirname(lockPath), { recursive: true })

  try {
    await writeLock(lockPath)
  } catch (error) {
    if (!isErrnoException(error) || error.code !== 'EEXIST') throw error

    const existing = await readLock(lockPath)
    const stale = !existing || Date.now() - existing.ts > timeoutMs
    if (!stale) throw new Error(`Lock exists: ${lockPath}`)

    await fs.unlink(lockPath).catch(() => undefined)
    await writeLock(lockPath)
  }

  return async () => {
    await fs.unlink(lockPath).catch(() => undefined)
  }
}
