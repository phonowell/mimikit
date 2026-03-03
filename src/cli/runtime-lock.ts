import { mkdir, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { bestEffort } from '../log/safe.js'
import { readErrorCode } from '../shared/error-code.js'

export type RuntimeLock = {
  path: string
  release: () => Promise<void>
}

const LOCK_TARGET_NAME = '.instance'
const LEGACY_LOCK_TARGET_NAME = '.instance.lock'
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

const LOCK_CHECK_OPTIONS = {
  realpath: LOCK_OPTIONS.realpath,
  stale: LOCK_OPTIONS.stale,
} as const

const cleanupLegacyLock = async (workDir: string): Promise<void> => {
  const legacyLockTarget = join(workDir, LEGACY_LOCK_TARGET_NAME)
  const legacyLockPath = `${legacyLockTarget}.lock`

  try {
    await stat(legacyLockPath)
  } catch (error) {
    if (readErrorCode(error) === 'ENOENT') return
    throw error
  }

  const isLegacyLockActive = await lockfile.check(
    legacyLockTarget,
    LOCK_CHECK_OPTIONS,
  )
  if (isLegacyLockActive) {
    throw new Error(`[cli] instance lock exists at ${legacyLockTarget}`)
  }

  await rm(legacyLockPath, { recursive: true, force: true })
}

export const acquireRuntimeLock = async (
  workDir: string,
): Promise<RuntimeLock> => {
  await mkdir(workDir, { recursive: true })
  await cleanupLegacyLock(workDir)
  const lockPath = join(workDir, LOCK_TARGET_NAME)
  let releaseLock: LockRelease
  try {
    releaseLock = await lockfile.lock(lockPath, LOCK_OPTIONS)
  } catch (error) {
    if (readErrorCode(error) !== 'ELOCKED') throw error
    throw new Error(`[cli] instance lock exists at ${lockPath}`)
  }

  let released = false
  return {
    path: lockPath,
    release: async () => {
      if (released) return
      released = true
      await bestEffort(
        'runtime_lock:release_lock_file',
        () => releaseLock(),
        { meta: { lockPath } },
      )
    },
  }
}
