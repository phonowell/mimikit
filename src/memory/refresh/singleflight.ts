import { join } from 'node:path'

import { readHistory } from '../../history/store.js'
import { appendLog } from '../../log/append.js'
import { bestEffort } from '../../log/safe.js'
import { persistRuntimeState } from '../../orchestrator/core/runtime-persistence.js'
import { isVisibleToAgent } from '../../shared/message-visibility.js'
import { truncateText } from '../../shared/text.js'
import { nowIso } from '../../shared/utils.js'
import { type MemoryScoreContext } from '../entry-score.js'
import { readMemoryMarkdown } from '../store.js'

import { applyMemoryPatch } from './apply-patch.js'
import { spawnMemoryRefreshJob } from './job-spawn.js'
import {
  hasMemoryRefreshDelta,
  resolveLatestPlanUpdatedAt,
  shouldTriggerMemoryRefresh,
} from './trigger-policy.js'

import type { MemoryRefreshPayload } from './types.js'
import type { RuntimeState } from '../../orchestrator/core/runtime-state.js'

const MAX_SIGNALS = 80
const MAX_TASKS = 40
const MAX_PLANS = 40
const MAX_TEXT = 800
const MAX_SCORE_QUERY_CHARS = 4_000
const MAX_SCORE_MENTION_ITEMS = 96

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
  const state = runtime.manager.memoryRefresh
  state.lastCompletedTurn = runtime.manager.turn
  state.lastProcessedInputsCursor = checkpoint.inputsCursor
  state.lastProcessedResultsCursor = checkpoint.resultsCursor
  if (checkpoint.planUpdatedAt)
    state.lastProcessedPlanUpdatedAt = checkpoint.planUpdatedAt
  else delete state.lastProcessedPlanUpdatedAt
  state.lastRunAt = nowIso()
}

const buildPayload = async (
  runtime: RuntimeState,
): Promise<MemoryRefreshPayload> => {
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
    ...(runtime.config.manager.baseUrl
      ? { baseUrl: runtime.config.manager.baseUrl }
      : {}),
    ...(runtime.config.manager.apiKey
      ? { apiKey: runtime.config.manager.apiKey }
      : {}),
    ...(runtime.config.manager.proxy
      ? { proxy: runtime.config.manager.proxy }
      : {}),
    modelReasoningEffort: runtime.config.manager.modelReasoningEffort,
    memoryMarkdown,
    signals: visible.map((item) => ({
      id: item.id,
      role: item.role,
      createdAt: item.createdAt,
      text: truncateText(item.text, MAX_TEXT),
    })),
    tasks,
    plans,
    ...(runtime.manager.compressedContext
      ? { compressedContext: runtime.manager.compressedContext }
      : {}),
  }
}

const pushMention = (target: string[], value: string | undefined): void => {
  const normalized = value?.trim()
  if (!normalized) return
  target.push(normalized)
}

const buildRefreshScoreContext = (
  payload: MemoryRefreshPayload,
): MemoryScoreContext => {
  const mentions: string[] = []
  for (const signal of payload.signals) pushMention(mentions, signal.text)
  for (const task of payload.tasks) {
    pushMention(mentions, task.title)
    pushMention(mentions, task.output)
  }
  for (const plan of payload.plans) pushMention(mentions, plan.title)
  pushMention(mentions, payload.compressedContext)

  const uniqueForQuery: string[] = []
  const querySeen = new Set<string>()
  for (const item of mentions) {
    const key = item.trim().toLowerCase()
    if (!key || querySeen.has(key)) continue
    querySeen.add(key)
    uniqueForQuery.push(item)
  }
  const queryText = uniqueForQuery
    .slice(0, MAX_SCORE_MENTION_ITEMS)
    .join('\n')
    .slice(0, MAX_SCORE_QUERY_CHARS)

  const workingFocusIds = [
    ...new Set(
      payload.tasks
        .filter(
          (task) =>
            task.status === 'pending' ||
            task.status === 'running' ||
            task.status === 'paused',
        )
        .map((task) => task.focusId),
    ),
  ]
  return {
    queryText,
    mentionTexts: mentions.slice(0, MAX_SCORE_MENTION_ITEMS),
    workingFocusIds,
  }
}

const runMemoryRefreshOnce = async (runtime: RuntimeState): Promise<void> => {
  const checkpoint = captureCheckpoint(runtime)
  await appendLog(runtime.paths.log, {
    event: 'memory_refresh_requested',
    managerTurn: runtime.manager.turn,
  })
  if (!hasMemoryRefreshDelta(runtime)) {
    markCompleted(runtime, checkpoint)
    await persistRuntimeState(runtime)
    await appendLog(runtime.paths.log, {
      event: 'memory_refresh_succeeded',
      mode: 'noop',
      reason: 'no_delta',
      managerTurn: runtime.manager.turn,
    })
    return
  }

  await appendLog(runtime.paths.log, {
    event: 'memory_refresh_started',
    managerTurn: runtime.manager.turn,
  })
  const payload = await buildPayload(runtime)
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
    const applied = await applyMemoryPatch(runtime.paths.memoryFile, {
      entries: output.entries,
      deleteEntryIds: output.deleteEntryIds,
      scoreContext: buildRefreshScoreContext(payload),
    })
    written = applied.written
    skipped = applied.skipped
    deleted = applied.deleted
    droppedByCompression = applied.droppedByCompression
  }

  markCompleted(runtime, checkpoint)
  await persistRuntimeState(runtime)
  await appendLog(runtime.paths.log, {
    event: 'memory_refresh_succeeded',
    managerTurn: runtime.manager.turn,
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

const runMemoryRefreshDrain = async (runtime: RuntimeState): Promise<void> => {
  const state = runtime.manager.memoryRefresh
  try {
    for (;;) {
      const runFromPending = state.pending
      if (!runFromPending && !shouldTriggerMemoryRefresh(runtime)) break
      state.pending = false
      await runMemoryRefreshOnce(runtime)
    }
  } catch (error) {
    await bestEffort('appendLog: memory_refresh_failed', () =>
      appendLog(runtime.paths.log, {
        event: 'memory_refresh_failed',
        managerTurn: runtime.manager.turn,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  } finally {
    state.running = false
    if (state.pending) {
      requestMemoryRefresh(runtime)
      return
    }
    state.pending = false
  }
}

export const requestMemoryRefresh = (runtime: RuntimeState): void => {
  const state = runtime.manager.memoryRefresh
  if (state.running) {
    state.pending = true
    return
  }
  if (!shouldTriggerMemoryRefresh(runtime) && !state.pending) return
  state.running = true
  state.pending = false
  void runMemoryRefreshDrain(runtime)
}
