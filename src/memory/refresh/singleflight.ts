import { join } from 'node:path'

import { readHistory } from '../../history/store.js'
import { appendLog } from '../../log/append.js'
import { bestEffort } from '../../log/safe.js'
import { persistRuntimeState } from '../../orchestrator/core/runtime-persistence.js'
import { isVisibleToAgent } from '../../shared/message-visibility.js'
import { truncateText } from '../../shared/text.js'
import { nowIso } from '../../shared/utils.js'

import { readMemoryMarkdown } from '../store.js'

import { applyMemoryPatch } from './apply-patch.js'
import { spawnMemoryRefreshJob } from './job-spawn.js'
import {
  hasMemoryRefreshDelta,
  resolveLatestPlanUpdatedAt,
  shouldTriggerMemoryRefresh,
} from './trigger-policy.js'

import type { RuntimeState } from '../../orchestrator/core/runtime-state.js'
import type { MemoryRefreshPayload } from './types.js'

const MAX_SIGNALS = 80
const MAX_TASKS = 40
const MAX_PLANS = 40
const MAX_TEXT = 800

type MemoryRefreshCheckpoint = {
  inputsCursor: number
  resultsCursor: number
  planUpdatedAt?: string
}

const captureCheckpoint = (runtime: RuntimeState): MemoryRefreshCheckpoint => {
  const planUpdatedAt = resolveLatestPlanUpdatedAt(runtime)
  return {
    inputsCursor: runtime.queues.inputsCursor,
    resultsCursor: runtime.queues.resultsCursor,
    ...(planUpdatedAt ? { planUpdatedAt } : {}),
  }
}

const markCompleted = (
  runtime: RuntimeState,
  checkpoint: MemoryRefreshCheckpoint,
): void => {
  const state = runtime.memoryRefresh
  state.lastCompletedTurn = runtime.managerTurn
  state.lastProcessedInputsCursor = checkpoint.inputsCursor
  state.lastProcessedResultsCursor = checkpoint.resultsCursor
  if (checkpoint.planUpdatedAt)
    state.lastProcessedPlanUpdatedAt = checkpoint.planUpdatedAt
  else delete state.lastProcessedPlanUpdatedAt
  state.lastRunAt = nowIso()
}

const buildPayload = async (runtime: RuntimeState): Promise<MemoryRefreshPayload> => {
  const history = await readHistory(runtime.paths.history)
  const visibleAll = history.filter((item) => isVisibleToAgent(item))
  const visible = visibleAll.slice(Math.max(0, visibleAll.length - MAX_SIGNALS))
  const tasks = runtime.tasks
    .slice(Math.max(0, runtime.tasks.length - MAX_TASKS))
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      focusId: task.focusId,
      ...(task.result?.output
        ? { output: truncateText(task.result.output, MAX_TEXT) }
        : {}),
    }))
  const plans = runtime.taskPlans
    .slice(Math.max(0, runtime.taskPlans.length - MAX_PLANS))
    .map((plan) => ({
      id: plan.id,
      title: plan.title,
      status: plan.status,
      updatedAt: plan.updatedAt,
    }))
  const memoryMarkdown = await readMemoryMarkdown(runtime.paths.memoryFile)
  return {
    workDir: runtime.config.workDir,
    model: runtime.config.manager.model,
    memoryMarkdown,
    signals: visible.map((item) => ({
      id: item.id,
      role: item.role,
      createdAt: item.createdAt,
      text: truncateText(item.text, MAX_TEXT),
    })),
    tasks,
    plans,
    ...(runtime.managerCompressedContext
      ? { compressedContext: runtime.managerCompressedContext }
      : {}),
  }
}

const runMemoryRefreshOnce = async (runtime: RuntimeState): Promise<void> => {
  const checkpoint = captureCheckpoint(runtime)
  await appendLog(runtime.paths.log, {
    event: 'memory_refresh_requested',
    managerTurn: runtime.managerTurn,
  })
  if (!hasMemoryRefreshDelta(runtime)) {
    markCompleted(runtime, checkpoint)
    await persistRuntimeState(runtime)
    await appendLog(runtime.paths.log, {
      event: 'memory_refresh_succeeded',
      mode: 'noop',
      reason: 'no_delta',
      managerTurn: runtime.managerTurn,
    })
    return
  }

  await appendLog(runtime.paths.log, {
    event: 'memory_refresh_started',
    managerTurn: runtime.managerTurn,
  })
  const payload = await buildPayload(runtime)
  const output = await spawnMemoryRefreshJob({
    jobsDir: join(runtime.paths.memoryDir, 'jobs'),
    payload,
  })
  let written = 0
  let skipped = 0
  if (output.mode === 'patch' && output.entries.length > 0) {
    const applied = await applyMemoryPatch(runtime.paths.memoryFile, output.entries)
    written = applied.written
    skipped = applied.skipped
  }

  markCompleted(runtime, checkpoint)
  await persistRuntimeState(runtime)
  await appendLog(runtime.paths.log, {
    event: 'memory_refresh_succeeded',
    managerTurn: runtime.managerTurn,
    mode: output.mode,
    reason: output.reason,
    entries: output.entries.length,
    written,
    skipped,
    harvest_reason: output.harvest.reason,
    curate_reason: output.curate.reason,
    compress_reason: output.compress.reason,
  })
}

const runMemoryRefreshDrain = async (runtime: RuntimeState): Promise<void> => {
  const state = runtime.memoryRefresh
  try {
    for (;;) {
      if (!shouldTriggerMemoryRefresh(runtime)) break
      await runMemoryRefreshOnce(runtime)
      if (!state.pending) break
      state.pending = false
    }
  } catch (error) {
    await bestEffort('appendLog: memory_refresh_failed', () =>
      appendLog(runtime.paths.log, {
        event: 'memory_refresh_failed',
        managerTurn: runtime.managerTurn,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  } finally {
    state.running = false
    if (state.pending && shouldTriggerMemoryRefresh(runtime)) {
      state.pending = false
      requestMemoryRefresh(runtime)
      return
    }
    state.pending = false
  }
}

export const requestMemoryRefresh = (runtime: RuntimeState): void => {
  if (!shouldTriggerMemoryRefresh(runtime)) return
  const state = runtime.memoryRefresh
  if (state.running) {
    state.pending = true
    return
  }
  state.running = true
  state.pending = false
  void runMemoryRefreshDrain(runtime)
}
