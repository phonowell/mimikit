import { mkdir, readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { readErrorCode } from '../../foundation/shared/error-code.js'
import { sleep } from '../../foundation/shared/utils.js'
import { isPidAlive } from '../../kernel/runtime/reaper-pid.js'
import { bestEffort } from '../../persistence/log/safe.js'

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

const LOCK_RETRY_GRACE_MS = 50

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

const acquireLockOnce = (lockTargetPath: string): Promise<LockRelease> =>
  lockfile.lock(lockTargetPath, LOCK_OPTIONS)

const readLockHeld = async (
  lockTargetPath: string,
): Promise<boolean | undefined> => {
  try {
    return await lockfile.check(lockTargetPath, LOCK_OPTIONS)
  } catch (error) {
    if (readErrorCode(error) === 'ENOENT') return false
    return undefined
  }
}

const waitForStaleLockWindowIfNeeded = async (params: {
  lease: LeaseDiagnostics | null
  lockPath: string
}): Promise<void> => {
  if (!params.lease || isPidAlive(params.lease.ownerPid)) return
  const stats = await stat(params.lockPath).catch(() => null)
  if (!stats) return
  const waitMs = Math.max(
    0,
    stats.mtimeMs + LOCK_OPTIONS.stale - Date.now() + LOCK_RETRY_GRACE_MS,
  )
  if (waitMs > 0) await sleep(waitMs)
}

const recoverFromLockedAcquire = async (params: {
  workDir: string
  lockTargetPath: string
  lockPath: string
}): Promise<LockRelease> => {
  const lease = await readLeaseDiagnostics(params.workDir)
  const lockHeld = await readLockHeld(params.lockTargetPath)
  if (lockHeld === false) {
    try {
      return await acquireLockOnce(params.lockTargetPath)
    } catch (error) {
      if (readErrorCode(error) !== 'ELOCKED') throw error
    }
  }

  await waitForStaleLockWindowIfNeeded({
    lease,
    lockPath: params.lockPath,
  })

  if (lease && !isPidAlive(lease.ownerPid)) {
    try {
      return await acquireLockOnce(params.lockTargetPath)
    } catch (error) {
      if (readErrorCode(error) !== 'ELOCKED') throw error
    }
  }

  const diag =
    lease === null
      ? ''
      : ` (ownerPid=${lease.ownerPid}, runtimeId=${lease.runtimeId}${
          lease.updatedAt ? `, updatedAt=${lease.updatedAt}` : ''
        })`
  throw new Error(`[cli] instance lock exists at ${params.lockPath}${diag}`)
}

export const acquireRuntimeLock = async (
  workDir: string,
): Promise<RuntimeLock> => {
  await mkdir(workDir, { recursive: true })
  const lockTargetPath = join(workDir, LOCK_TARGET_NAME)
  const lockPath = `${lockTargetPath}${LOCK_SUFFIX}`
  let releaseLock: LockRelease
  try {
    releaseLock = await acquireLockOnce(lockTargetPath)
  } catch (error) {
    if (readErrorCode(error) !== 'ELOCKED') throw error
    releaseLock = await recoverFromLockedAcquire({
      workDir,
      lockTargetPath,
      lockPath,
    })
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
