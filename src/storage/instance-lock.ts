import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

import { safe } from '../log/safe.js'

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
  const raw = await safe(
    'readLockData: readFile',
    () => readFile(path, 'utf8'),
    {
      fallback: null,
      meta: { path },
    },
  )
  if (!raw) return {}
  return safe('readLockData: parse', () => JSON.parse(raw) as LockData, {
    fallback: {},
    meta: { path },
  })
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
    await safe(
      'instanceLock: writeFile',
      () => handle.writeFile(payload, 'utf8'),
      {
        fallback: undefined,
        meta: { path: lockPath },
      },
    )
    return { handle }
  }

  try {
    const { handle } = await tryAcquire()
    const release = async () => {
      await safe('instanceLock: close', () => handle.close(), {
        fallback: undefined,
        meta: { path: lockPath },
      })
      await safe('instanceLock: unlink', () => unlink(lockPath), {
        fallback: undefined,
        meta: { path: lockPath },
      })
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

  await safe('instanceLock: unlink stale', () => unlink(lockPath), {
    fallback: undefined,
    meta: { path: lockPath },
  })
  const { handle } = await tryAcquire()
  const release = async () => {
    await safe('instanceLock: close', () => handle.close(), {
      fallback: undefined,
      meta: { path: lockPath },
    })
    await safe('instanceLock: unlink', () => unlink(lockPath), {
      fallback: undefined,
      meta: { path: lockPath },
    })
  }
  return { lockPath, release }
}
