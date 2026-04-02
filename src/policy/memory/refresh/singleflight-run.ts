import { nowIso } from '../../../foundation/shared/utils.js'
import { persistRuntimeState } from '../../../kernel/orchestrator/runtime-persistence.js'
import { appendLog } from '../../../persistence/log/append.js'

import { applyMemoryPatch } from './apply-patch.js'
import { runMemoryRefreshSingleCall } from './single-call.js'
import {
  buildMemoryRefreshPayload,
  buildRefreshScoreContext,
} from './singleflight-payload.js'
import { hasMemoryRefreshDelta } from './trigger-policy.js'

import type { ManagerRuntime } from '../../../kernel/orchestrator/runtime-interfaces.js'

export const MEMORY_REFRESH_SOURCE = 'memory_refresh'
export const MEMORY_REFRESH_AUDIT_EVENTS = {
  requested: 'memory_refresh_requested',
  started: 'memory_refresh_started',
  succeeded: 'memory_refresh_succeeded',
  failed: 'memory_refresh_failed',
} as const

type MemoryRefreshCheckpoint = { signalVersion: number }

const captureCheckpoint = (
  runtime: ManagerRuntime,
): MemoryRefreshCheckpoint => ({
  signalVersion: runtime.process.manager.memoryRefresh.signalVersion,
})

const markCompleted = (
  runtime: ManagerRuntime,
  checkpoint: MemoryRefreshCheckpoint,
): void => {
  const state = runtime.process.manager.memoryRefresh
  state.lastCompletedTurn = runtime.process.manager.turn
  state.lastProcessedSignalVersion = checkpoint.signalVersion
  state.lastRunAt = nowIso()
}

export const runMemoryRefreshOnce = async (
  runtime: ManagerRuntime,
): Promise<void> => {
  const checkpoint = captureCheckpoint(runtime)
  await appendLog(runtime.paths.log, {
    event: MEMORY_REFRESH_AUDIT_EVENTS.requested,
    managerTurn: runtime.process.manager.turn,
    source: MEMORY_REFRESH_SOURCE,
  })
  if (!hasMemoryRefreshDelta(runtime)) {
    markCompleted(runtime, checkpoint)
    await persistRuntimeState(runtime)
    await appendLog(runtime.paths.log, {
      event: MEMORY_REFRESH_AUDIT_EVENTS.succeeded,
      mode: 'noop',
      reason: 'no_delta',
      managerTurn: runtime.process.manager.turn,
      source: MEMORY_REFRESH_SOURCE,
    })
    return
  }

  await appendLog(runtime.paths.log, {
    event: MEMORY_REFRESH_AUDIT_EVENTS.started,
    managerTurn: runtime.process.manager.turn,
    source: MEMORY_REFRESH_SOURCE,
  })
  const payload = await buildMemoryRefreshPayload(runtime)
  const output = await runMemoryRefreshSingleCall({ payload })
  let written = 0
  let skipped = 0
  let deleted = 0
  let droppedByCompression = 0
  const hasPatch = output.entries.length > 0 || output.deleteEntryIds.length > 0
  if (output.mode === 'patch' && hasPatch) {
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
  await persistRuntimeState(runtime)
  await appendLog(runtime.paths.log, {
    event: MEMORY_REFRESH_AUDIT_EVENTS.succeeded,
    managerTurn: runtime.process.manager.turn,
    source: MEMORY_REFRESH_SOURCE,
    mode: output.mode,
    reason: output.reason,
    entries: output.entries.length,
    deletes: output.deleteEntryIds.length,
    written,
    skipped,
    deleted,
    dropped_by_compression: droppedByCompression,
  })
}
