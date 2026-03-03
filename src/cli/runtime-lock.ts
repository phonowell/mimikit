import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { bestEffort } from '../log/safe.js'
import { readErrorCode } from '../shared/error-code.js'

export type RuntimeLock = {
  path: string
  release: () => Promise<void>
}

const LOCK_FILE_NAME = '.instance.lock'
type LockRelease = () => Promise<void>

const require = createRequire(import.meta.url)
const lockfile = require('proper-lockfile') as {
  lock: (file: string, options: Record<string, unknown>) => Promise<LockRelease>
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

export const acquireRuntimeLock = async (
  workDir: string,
): Promise<RuntimeLock> => {
  await mkdir(workDir, { recursive: true })
  const lockPath = join(workDir, LOCK_FILE_NAME)
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
