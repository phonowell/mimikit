import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { sleep } from '../../foundation/shared/utils.js'
import { buildPaths } from '../../persistence/fs/paths.js'

import { LEASE_TTL_MS, REAPER_POLL_MS } from './reaper-constants.js'
import { isPidAlive } from './reaper-pid.js'
import { readLease } from './reaper-registry.js'
import {
  cleanupOrphanChildren,
  ensureRuntimeDirs,
  hasLockFile,
} from './reaper-shared.js'

const REAPER_MARKER_NAME = 'reaper.json'

const parseRequiredEnv = (key: string): string => {
  const value = process.env[key]?.trim()
  if (!value) throw new Error(`runtime_reaper_missing_env:${key}`)
  return value
}

const parseOwnerPid = (): number => {
  const raw = parseRequiredEnv('MIMIKIT_REAPER_OWNER_PID')
  const pid = Number.parseInt(raw, 10)
  if (!Number.isInteger(pid) || pid <= 0)
    throw new Error('runtime_reaper_invalid_owner_pid')
  return pid
}

export const runReaperDaemon = async (): Promise<never> => {
  const workDir = parseRequiredEnv('MIMIKIT_REAPER_WORK_DIR')
  const runtimeId = parseRequiredEnv('MIMIKIT_REAPER_RUNTIME_ID')
  const lockPath = parseRequiredEnv('MIMIKIT_REAPER_LOCK_PATH')
  const ownerPid = parseOwnerPid()

  const paths = buildPaths(workDir)
  await ensureRuntimeDirs(paths)

  const markerPath = join(paths.runtimeDir, REAPER_MARKER_NAME)

  for (;;) {
    const lockExists = await hasLockFile(lockPath)
    const ownerAlive = isPidAlive(ownerPid)
    const lease = await readLease(paths.runtimeLease)
    const leaseExpired =
      lease?.runtimeId !== runtimeId ||
      lease.ownerPid !== ownerPid ||
      Date.now() - lease.updatedAtMs > LEASE_TTL_MS

    if (!lockExists || !ownerAlive || leaseExpired) {
      await cleanupOrphanChildren({ paths })
      await rm(markerPath, { force: true }).catch(() => undefined)
      process.exit(0)
    }

    await sleep(REAPER_POLL_MS)
  }
}
