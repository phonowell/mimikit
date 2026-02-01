import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

type LockData = {
  pid?: number
  startedAt?: string
}

const isProcessAlive = (pid: number): boolean => {
  if (!Number.isFinite(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : null
    if (code === 'EPERM') return true
    return false
  }
}

const readLockData = async (path: string): Promise<LockData> => {
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as LockData
  } catch {
    return {}
  }
}

export const acquireInstanceLock = async (stateDir: string) => {
  await mkdir(stateDir, { recursive: true })
  const lockPath = join(stateDir, '.instance.lock')

  const tryAcquire = async () => {
    const handle = await open(lockPath, 'wx')
    const payload = JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString(),
    })
    await handle.writeFile(payload, 'utf8').catch(() => undefined)
    return { handle }
  }

  try {
    const { handle } = await tryAcquire()
    const release = async () => {
      await handle.close().catch(() => undefined)
      await unlink(lockPath).catch(() => undefined)
    }
    return { lockPath, release }
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : null
    if (code !== 'EEXIST') throw error
  }

  const existing = await readLockData(lockPath)
  if (existing.pid && isProcessAlive(existing.pid))
    throw new Error(`[cli] instance already running (pid ${existing.pid}).`)

  await unlink(lockPath).catch(() => undefined)
  const { handle } = await tryAcquire()
  const release = async () => {
    await handle.close().catch(() => undefined)
    await unlink(lockPath).catch(() => undefined)
  }
  return { lockPath, release }
}
