import { spawn } from 'node:child_process'
import { join } from 'node:path'

import { readJson, writeJson } from '../fs/json.js'
import { logSafeError } from '../log/safe.js'
import { nowIso } from '../shared/utils.js'

import { LEASE_HEARTBEAT_MS } from './reaper-constants.js'
import { isPidAlive } from './reaper-pid.js'
import {
  removeChildById,
  removeLeaseFileIfExists,
  upsertChild,
} from './reaper-registry.js'
import {
  cleanupOrphanChildren,
  ensureRuntimeDirs,
  refreshLease,
} from './reaper-shared.js'

import type {
  CreateRuntimeReaperHandleParams,
  RuntimeReaperHandle,
} from './reaper-types.js'

const REAPER_MARKER_NAME = 'reaper.json'

const ensureReaperStarted = async (params: {
  workDir: string
  runtimeDir: string
  runtimeId: string
  ownerPid: number
  lockPath: string
}): Promise<void> => {
  const markerPath = join(params.runtimeDir, REAPER_MARKER_NAME)
  const marker = await readJson<{
    pid?: number
    runtimeId?: string
    ownerPid?: number
  } | null>(markerPath, null, { quietParseError: true })
  const existingPidValue = marker?.pid
  if (
    typeof existingPidValue === 'number' &&
    existingPidValue > 0 &&
    marker?.runtimeId === params.runtimeId &&
    marker.ownerPid === params.ownerPid &&
    isPidAlive(existingPidValue)
  )
    return

  const daemonUrl = new URL('./reaper-daemon.ts', import.meta.url)
  const proc = spawn(
    process.execPath,
    ['--import', 'tsx/esm', daemonUrl.href],
    {
      cwd: params.workDir,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        MIMIKIT_REAPER_WORK_DIR: params.workDir,
        MIMIKIT_REAPER_RUNTIME_ID: params.runtimeId,
        MIMIKIT_REAPER_OWNER_PID: String(params.ownerPid),
        MIMIKIT_REAPER_LOCK_PATH: params.lockPath,
      },
    },
  )
  if (!proc.pid) throw new Error('runtime_reaper_spawn_pid_missing')
  await writeJson(markerPath, {
    pid: proc.pid,
    runtimeId: params.runtimeId,
    ownerPid: params.ownerPid,
    updatedAt: nowIso(),
  })
  proc.unref()
}

export const createRuntimeReaperHandle = async (
  params: CreateRuntimeReaperHandleParams,
): Promise<RuntimeReaperHandle> => {
  const ownerPid = process.pid

  await ensureRuntimeDirs(params.paths)
  await cleanupOrphanChildren({ paths: params.paths })
  await refreshLease({
    path: params.paths.runtimeLease,
    runtimeId: params.runtimeId,
    ownerPid,
  })

  await ensureReaperStarted({
    workDir: params.paths.root,
    runtimeDir: params.paths.runtimeDir,
    runtimeId: params.runtimeId,
    ownerPid,
    lockPath: params.runtimeLock.path,
  })

  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let heartbeatRunning = false
  let heartbeatStopped = false

  const heartbeatOnce = async (): Promise<void> => {
    if (heartbeatStopped || heartbeatRunning) return
    heartbeatRunning = true
    try {
      await refreshLease({
        path: params.paths.runtimeLease,
        runtimeId: params.runtimeId,
        ownerPid,
      })
    } finally {
      heartbeatRunning = false
    }
  }

  return {
    startHeartbeat: async (): Promise<void> => {
      heartbeatStopped = false
      await heartbeatOnce()
      if (heartbeatTimer) return
      heartbeatTimer = setInterval(() => {
        void heartbeatOnce().catch((error) => {
          void logSafeError('runtime_reaper:heartbeat_tick', error, {
            ...(params.logPath ? { logPath: params.logPath } : {}),
          })
        })
      }, LEASE_HEARTBEAT_MS)
      heartbeatTimer.unref()
    },

    stopHeartbeat: async (): Promise<void> => {
      heartbeatStopped = true
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = undefined
      }
      await removeLeaseFileIfExists(params.paths.runtimeLease)
    },

    registerChild: async (child): Promise<void> => {
      if (!Number.isInteger(child.pid) || child.pid <= 0) return
      await upsertChild({
        path: params.paths.runtimeChildren,
        item: {
          id: child.id,
          runtimeId: params.runtimeId,
          ownerPid,
          kind: child.kind,
          pid: child.pid,
          createdAt: nowIso(),
          ...(child.meta ? { meta: child.meta } : {}),
        },
      })
    },

    unregisterChild: async (id): Promise<void> => {
      await removeChildById(params.paths.runtimeChildren, id)
    },
  }
}
