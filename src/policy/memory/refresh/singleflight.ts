import { join } from 'node:path'

import { truncateText } from '../../../foundation/shared/text.js'
import { nowIso } from '../../../foundation/shared/utils.js'
import { type HistoryMessage } from '../../../foundation/types/index.js'
import {
  assertBackgroundWriteAllowed,
  getBackgroundJobSpec,
} from '../../../kernel/background-write-policy.js'
import { persistRuntimeState } from '../../../kernel/orchestrator/runtime-persistence.js'
import { readHistory } from '../../../persistence/history/store.js'
import { appendLog } from '../../../persistence/log/append.js'
import { bestEffort } from '../../../persistence/log/safe.js'
import { readMemoryMarkdown } from '../../../work/memory/store.js'
import { type MemoryScoreContext } from '../entry-score.js'

import { applyMemoryPatch } from './apply-patch.js'
import { spawnMemoryRefreshJob } from './job-spawn.js'
import {
  hasMemoryRefreshDelta,
  shouldTriggerMemoryRefresh,
} from './trigger-policy.js'

import type { MemoryRefreshPayload } from './types.js'
import type { RuntimeState } from '../../../kernel/orchestrator/runtime-state.js'

const MAX_SIGNALS = 80
const MAX_TEXT = 800
const MAX_SCORE_QUERY_CHARS = 4_000
const MAX_SCORE_MENTION_ITEMS = 96
const MEMORY_SIGNAL_EVENTS = new Set(['memory_remembered'])
const MEMORY_REFRESH_JOB = getBackgroundJobSpec('memory_refresh')

type MemoryRefreshCheckpoint = {
  signalVersion: number
}

const captureCheckpoint = (runtime: RuntimeState): MemoryRefreshCheckpoint => ({
  signalVersion: runtime.manager.memoryRefresh.signalVersion,
})

const markCompleted = (
  runtime: RuntimeState,
  checkpoint: MemoryRefreshCheckpoint,
): void => {
  const state = runtime.manager.memoryRefresh
  state.lastCompletedTurn = runtime.manager.turn
  state.lastProcessedSignalVersion = checkpoint.signalVersion
  state.lastRunAt = nowIso()
}

const toMemoryRefreshSignalText = (item: HistoryMessage): string => {
  if (item.role !== 'system') return truncateText(item.text, MAX_TEXT)
  const entryId = item.systemEventPayload?.entry_id
  const category = item.systemEventPayload?.category
  const ref = item.systemEventPayload?.ref
  const operation = item.systemEventPayload?.operation
  const parts = [
    typeof entryId === 'string' ? `entry_id=${entryId}` : undefined,
    typeof category === 'string' ? `category=${category}` : undefined,
    typeof ref === 'string' ? `ref=${ref}` : undefined,
    typeof operation === 'string' ? `operation=${operation}` : undefined,
  ].filter((value): value is string => Boolean(value))
  if (parts.length > 0) return parts.join('\n')
  return truncateText(item.text, MAX_TEXT)
}

const buildPayload = async (
  runtime: RuntimeState,
): Promise<MemoryRefreshPayload> => {
  const history = await readHistory(runtime.paths.history)
  const visible = history
    .filter((item) => isMemoryRefreshSignal(item))
    .slice(-MAX_SIGNALS)
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
      text: truncateText(toMemoryRefreshSignalText(item), MAX_TEXT),
    })),
  }
}

const isMemoryRefreshSignal = (item: HistoryMessage): boolean => {
  if (item.role !== 'system') return false
  const eventName = item.systemEventName?.trim()
  if (!eventName) return false
  return MEMORY_SIGNAL_EVENTS.has(eventName)
}

const pushMention = (target: string[], value: string | undefined): void => {
  const normalized = value?.trim()
  if (!normalized) return
  target.push(normalized)
}

const buildRefreshScoreContext = (
  runtime: RuntimeState,
  payload: MemoryRefreshPayload,
): MemoryScoreContext => {
  const mentions: string[] = []
  for (const event of payload.signals) pushMention(mentions, event.text)

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
      runtime.tasks
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

const runMemoryRefreshDrain = async (runtime: RuntimeState): Promise<void> => {
  const state = runtime.manager.memoryRefresh
  try {
    while (state.pending || shouldTriggerMemoryRefresh(runtime)) {
      state.pending = false
      await runMemoryRefreshOnce(runtime)
    }
  } catch (error) {
    await bestEffort('appendLog: memory_refresh_failed', () =>
      appendLog(runtime.paths.log, {
        event: MEMORY_REFRESH_JOB.auditEvents.failed,
        managerTurn: runtime.manager.turn,
        source: MEMORY_REFRESH_JOB.source,
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
  if (!state.pending && !shouldTriggerMemoryRefresh(runtime)) return
  state.running = true
  state.pending = false
  void runMemoryRefreshDrain(runtime)
}
