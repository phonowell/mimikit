import { join } from 'node:path'

import { nowIso } from '../../../foundation/shared/utils.js'
import {
  assertBackgroundWriteAllowed,
  getBackgroundJobSpec,
} from '../../../kernel/background-write-policy.js'
import { persistRuntimeState } from '../../../kernel/orchestrator/runtime-persistence.js'
import { appendLog } from '../../../persistence/log/append.js'

import { applyMemoryPatch } from './apply-patch.js'
import { spawnMemoryRefreshJob } from './job-spawn.js'
import {
  buildMemoryRefreshPayload,
  buildRefreshScoreContext,
} from './singleflight-payload.js'
import { hasMemoryRefreshDelta } from './trigger-policy.js'

import type { ManagerRuntime } from '../../../kernel/orchestrator/runtime-interfaces.js'

export const MEMORY_REFRESH_JOB = getBackgroundJobSpec('memory_refresh')

type MemoryRefreshCheckpoint = { signalVersion: number }

const captureCheckpoint = (
  runtime: ManagerRuntime,
): MemoryRefreshCheckpoint => ({
  signalVersion: runtime.manager.memoryRefresh.signalVersion,
})

const markCompleted = (
  runtime: ManagerRuntime,
  checkpoint: MemoryRefreshCheckpoint,
): void => {
  const state = runtime.manager.memoryRefresh
  state.lastCompletedTurn = runtime.manager.turn
  state.lastProcessedSignalVersion = checkpoint.signalVersion
  state.lastRunAt = nowIso()
}

export const runMemoryRefreshOnce = async (
  runtime: ManagerRuntime,
): Promise<void> => {
  const checkpoint = captureCheckpoint(runtime)
  await appendLog(runtime.paths.log, {
    event: MEMORY_REFRESH_JOB.auditEvents.requested,
    managerTurn: runtime.manager.turn,
    source: MEMORY_REFRESH_JOB.source,
  })
  if (!hasMemoryRefreshDelta(runtime)) {
    markCompleted(runtime, checkpoint)
    assertBackgroundWriteAllowed('memory_refresh', 'runtime_meta')
    await persistRuntimeState(runtime)
    await appendLog(runtime.paths.log, {
      event: MEMORY_REFRESH_JOB.auditEvents.succeeded,
      mode: 'noop',
      reason: 'no_delta',
      managerTurn: runtime.manager.turn,
      source: MEMORY_REFRESH_JOB.source,
    })
    return
  }

  await appendLog(runtime.paths.log, {
    event: MEMORY_REFRESH_JOB.auditEvents.started,
    managerTurn: runtime.manager.turn,
    source: MEMORY_REFRESH_JOB.source,
  })
  const payload = await buildMemoryRefreshPayload(runtime)
  const output = await spawnMemoryRefreshJob({
    jobsDir: join(runtime.paths.memoryDir, 'jobs'),
    payload,
  })
  let written = 0
  let skipped = 0
  let deleted = 0
  let droppedByCompression = 0
  const hasPatch = output.entries.length > 0 || output.deleteEntryIds.length > 0
  if (output.mode === 'patch' && hasPatch) {
    assertBackgroundWriteAllowed('memory_refresh', 'memory')
    const applied = await applyMemoryPatch(runtime.paths.memoryFile, {
      entries: output.entries,
      deleteEntryIds: output.deleteEntryIds,
      scoreContext: buildRefreshScoreContext(runtime, payload),
    })
    written = applied.written
    skipped = applied.skipped
    deleted = applied.deleted
    droppedByCompression = applied.droppedByCompression
  }

  markCompleted(runtime, checkpoint)
  assertBackgroundWriteAllowed('memory_refresh', 'runtime_meta')
  await persistRuntimeState(runtime)
  await appendLog(runtime.paths.log, {
    event: MEMORY_REFRESH_JOB.auditEvents.succeeded,
    managerTurn: runtime.manager.turn,
    source: MEMORY_REFRESH_JOB.source,
    mode: output.mode,
    reason: output.reason,
    entries: output.entries.length,
    deletes: output.deleteEntryIds.length,
    written,
    skipped,
    deleted,
    dropped_by_compression: droppedByCompression,
    harvest_reason: output.harvest.reason,
    curate_reason: output.curate.reason,
    compress_reason: output.compress.reason,
  })
}
