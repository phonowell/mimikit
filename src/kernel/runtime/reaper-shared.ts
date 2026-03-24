import { access } from 'node:fs/promises'

import { nowIso } from '../../foundation/shared/utils.js'
import { ensureDir } from '../../persistence/fs/paths.js'

import {
  CLEANUP_FORCE_MS,
  CLEANUP_GRACE_MS,
  LEASE_TTL_MS,
} from './reaper-constants.js'
import { isPidAlive, killPidBestEffort } from './reaper-pid.js'
import {
  readChildrenRegistry,
  readLease,
  writeChildrenRegistry,
  writeLease,
} from './reaper-registry.js'

import type { LeaseRecord } from './reaper-types.js'
import type { StatePaths } from '../../persistence/fs/paths.js'

const buildLeaseRecord = (params: {
  runtimeId: string
  ownerPid: number
}): LeaseRecord => {
  const updatedAtMs = Date.now()
  return {
    runtimeId: params.runtimeId,
    ownerPid: params.ownerPid,
    updatedAtMs,
    updatedAt: nowIso(),
  }
}

export const refreshLease = async (params: {
  path: string
  runtimeId: string
  ownerPid: number
}): Promise<void> => {
  await writeLease({
    path: params.path,
    value: buildLeaseRecord({
      runtimeId: params.runtimeId,
      ownerPid: params.ownerPid,
    }),
  })
}

const shouldCleanupChildren = async (
  leasePath: string,
  ownerPid: number,
): Promise<boolean> => {
  const lease = await readLease(leasePath)
  if (!lease) return true
  if (lease.ownerPid !== ownerPid) return !isPidAlive(ownerPid)
  if (lease.runtimeId.trim().length === 0) return true
  if (Date.now() - lease.updatedAtMs > LEASE_TTL_MS) return true
  return !isPidAlive(lease.ownerPid)
}

export const cleanupOrphanChildren = async (params: {
  paths: StatePaths
}): Promise<void> => {
  const registry = await readChildrenRegistry(params.paths.runtimeChildren)
  if (registry.items.length === 0) return

  const kept = [] as typeof registry.items
  for (const item of registry.items) {
    const shouldCleanup = await shouldCleanupChildren(
      params.paths.runtimeLease,
      item.ownerPid,
    )
    if (!shouldCleanup) {
      kept.push(item)
      continue
    }

    const exitedByTerm = await killPidBestEffort({
      pid: item.pid,
      signal: 'SIGTERM',
      waitMs: CLEANUP_GRACE_MS,
    })
    if (!exitedByTerm) {
      await killPidBestEffort({
        pid: item.pid,
        signal: 'SIGKILL',
        waitMs: CLEANUP_FORCE_MS,
      })
    }
    if (isPidAlive(item.pid)) kept.push(item)
  }

  await writeChildrenRegistry(params.paths.runtimeChildren, { items: kept })
}

export const ensureRuntimeDirs = async (paths: StatePaths): Promise<void> => {
  await ensureDir(paths.runtimeDir)
}

export const hasLockFile = (path: string): Promise<boolean> =>
  access(path)
    .then(() => true)
    .catch(() => false)
