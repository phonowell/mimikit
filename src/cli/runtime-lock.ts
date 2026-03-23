import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { bestEffort } from '../log/safe.js'
import { readErrorCode } from '../shared/error-code.js'

export type RuntimeLock = {
  path: string
  release: () => Promise<void>
}

const LOCK_TARGET_NAME = '.instance'
const LOCK_SUFFIX = '.lock'
type LockRelease = () => Promise<void>

const require = createRequire(import.meta.url)
const lockfile = require('proper-lockfile') as {
  lock: (file: string, options: Record<string, unknown>) => Promise<LockRelease>
  check: (file: string, options: Record<string, unknown>) => Promise<boolean>
}

const LOCK_OPTIONS = {
  realpath: false,
  stale: 15_000,
  update: 5_000,
  retries: {
    retries: 6,
    factor: 1.5,
    minTimeout: 20,
    maxTimeout: 500,
  },
} as const

type LeaseDiagnostics = {
  runtimeId: string
  ownerPid: number
  updatedAt?: string
}

const readLeaseDiagnostics = async (
  workDir: string,
): Promise<LeaseDiagnostics | null> => {
  const leasePath = join(workDir, 'runtime', 'lease.json')
  const raw = await readFile(leasePath, 'utf8').catch(() => null)
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return null
  const obj = parsed as Record<string, unknown>
  if (typeof obj.runtimeId !== 'string') return null
  if (!Number.isInteger(obj.ownerPid) || (obj.ownerPid as number) <= 0)
    return null
  return {
    runtimeId: obj.runtimeId,
    ownerPid: obj.ownerPid as number,
    ...(typeof obj.updatedAt === 'string' ? { updatedAt: obj.updatedAt } : {}),
  }
}

export const acquireRuntimeLock = async (
  workDir: string,
): Promise<RuntimeLock> => {
  await mkdir(workDir, { recursive: true })
  const lockTargetPath = join(workDir, LOCK_TARGET_NAME)
  const lockPath = `${lockTargetPath}${LOCK_SUFFIX}`
  let releaseLock: LockRelease
  try {
    releaseLock = await lockfile.lock(lockTargetPath, LOCK_OPTIONS)
  } catch (error) {
    if (readErrorCode(error) !== 'ELOCKED') throw error
    const lease = await readLeaseDiagnostics(workDir)
    const diag =
      lease === null
        ? ''
        : ` (ownerPid=${lease.ownerPid}, runtimeId=${lease.runtimeId}${
            lease.updatedAt ? `, updatedAt=${lease.updatedAt}` : ''
          })`
    throw new Error(`[cli] instance lock exists at ${lockPath}${diag}`)
  }

  let released = false
  return {
    path: lockPath,
    release: async () => {
      if (released) return
      released = true
      await bestEffort('runtime_lock:release_lock_file', () => releaseLock(), {
        meta: { lockPath },
      })
    },
  }
}
