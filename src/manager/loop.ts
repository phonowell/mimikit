import { Cron } from 'croner'

import { parseActions } from '../actions/protocol/parse.js'
import { appendLog } from '../log/append.js'
import { bestEffort, logSafeError, safe } from '../log/safe.js'
import { waitForManagerLoopSignal } from '../orchestrator/core/manager-signal.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { enqueueTask } from '../orchestrator/core/task-state.js'
import { notifyUiSignal } from '../orchestrator/core/ui-signal.js'
import { notifyWorkerLoop } from '../orchestrator/core/worker-signal.js'
import {
  appendCompactedSummary,
  buildCompactedSummary,
  formatCompactedContext,
  readCompactedSummaries,
} from '../orchestrator/read-model/history-compaction.js'
import { selectRecentHistory } from '../orchestrator/read-model/history-select.js'
import { appendTaskSystemMessage } from '../orchestrator/read-model/task-history.js'
import { selectRecentTasks } from '../orchestrator/read-model/task-select.js'
import { nowIso } from '../shared/utils.js'
import { appendHistory, readHistory } from '../storage/jsonl.js'
import { consumeUserInputs, consumeWorkerResults } from '../streams/queues.js'
import { enqueueWorkerTask } from '../worker/dispatch.js'

import { applyTaskActions, collectTaskResultSummaries } from './action-apply.js'
import { extractFocusState, stripFocusBlock } from './focus-extract.js'
import {
  appendConsumedInputsToHistory,
  appendConsumedResultsToHistory,
  appendManagerFallbackReply,
} from './history.js'
import {
  buildFallbackReply,
  drainBatchOnFailure,
  finalizeBatchProgress,
} from './loop-helpers.js'
import { executeManagerProfileTasks } from './manager-task-runner.js'
import { runManager } from './runner.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TokenUsage } from '../types/index.js'

const matchCronNow = (expression: string, at: Date = new Date()): boolean =>
  new Cron(expression).match(at)

const cronHasNextRun = (expression: string): boolean => {
  try {
    return new Cron(expression).nextRun() !== null
  } catch {
    return false
  }
}

const asSecondStamp = (iso: string): string => iso.slice(0, 19)

const hasNonEmptyTaskId = (payload: unknown): boolean => {
  if (!payload || typeof payload !== 'object') return false
  const { taskId } = payload as { taskId?: unknown }
  return typeof taskId === 'string' && taskId.trim().length > 0
}

const createUiStreamId = (
  inputsCursor: number,
  resultsCursor: number,
): string => `manager-stream-${Date.now()}-${inputsCursor}-${resultsCursor}`

const startUiStream = (runtime: RuntimeState, streamId: string): void => {
  const stamp = nowIso()
  runtime.uiStream = {
    id: streamId,
    role: 'assistant',
    text: '',
    createdAt: stamp,
    updatedAt: stamp,
  }
}

const isSameUsage = (
  left: TokenUsage | undefined,
  right: TokenUsage | undefined,
): boolean =>
  left?.input === right?.input &&
  left?.output === right?.output &&
  left?.total === right?.total

const setUiStreamText = (
  runtime: RuntimeState,
  streamId: string,
  nextText: string,
): void => {
  const stream = runtime.uiStream
  if (stream?.id !== streamId) return
  if (stream.text === nextText) return
  stream.text = nextText
  stream.updatedAt = nowIso()
  notifyUiSignal(runtime)
}

const resetUiStream = (runtime: RuntimeState, streamId: string): void => {
  const stream = runtime.uiStream
  if (stream?.id !== streamId) return
  stream.text = ''
  if ('usage' in stream) delete stream.usage
  stream.updatedAt = nowIso()
  notifyUiSignal(runtime)
}

const setUiStreamUsage = (
  runtime: RuntimeState,
  streamId: string,
  nextUsage: TokenUsage,
): void => {
  const stream = runtime.uiStream
  if (stream?.id !== streamId) return
  if (isSameUsage(stream.usage, nextUsage)) return
  stream.usage = nextUsage
  stream.updatedAt = nowIso()
  notifyUiSignal(runtime)
}

const stopUiStream = (runtime: RuntimeState, streamId: string): void => {
  if (runtime.uiStream?.id !== streamId) return
  runtime.uiStream = null
}

const toVisibleAssistantText = (rawOutput: string): string => {
  if (!rawOutput) return ''
  const stripped = stripFocusBlock(rawOutput)
  return parseActions(stripped).text
}

const checkCronJobs = async (runtime: RuntimeState): Promise<void> => {
  if (runtime.cronJobs.length === 0) return

  const now = new Date()
  const nowAtIso = now.toISOString()
  const nowSecond = asSecondStamp(nowAtIso)

  let stateChanged = false
  for (const cronJob of runtime.cronJobs) {
    if (!cronJob.enabled) continue

    if (cronJob.scheduledAt) {
      const scheduledMs = Date.parse(cronJob.scheduledAt)
      if (!Number.isFinite(scheduledMs) || now.getTime() < scheduledMs) continue
      if (cronJob.lastTriggeredAt) continue

      cronJob.lastTriggeredAt = nowAtIso
      cronJob.enabled = false
      cronJob.disabledReason = 'completed'
      stateChanged = true

      const { task, created } = enqueueTask(
        runtime.tasks,
        cronJob.prompt,
        cronJob.title,
        cronJob.profile,
        cronJob.scheduledAt,
      )
      if (!created) continue

      task.cron = cronJob.scheduledAt
      await appendTaskSystemMessage(runtime.paths.history, 'created', task, {
        createdAt: task.createdAt,
      })
      if (cronJob.profile !== 'manager') {
        enqueueWorkerTask(runtime, task)
        notifyWorkerLoop(runtime)
      }
      continue
    }

    if (!cronJob.cron) continue
    if (
      cronJob.lastTriggeredAt &&
      asSecondStamp(cronJob.lastTriggeredAt) === nowSecond
    )
      continue

    let matched = false
    try {
      matched = matchCronNow(cronJob.cron, now)
    } catch (error) {
      await bestEffort('appendLog: cron_expression_error', () =>
        appendLog(runtime.paths.log, {
          event: 'cron_expression_error',
          cronJobId: cronJob.id,
          cron: cronJob.cron,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
      continue
    }
    if (!matched) continue

    cronJob.lastTriggeredAt = nowAtIso
    stateChanged = true
    const { task, created } = enqueueTask(
      runtime.tasks,
      cronJob.prompt,
      cronJob.title,
      cronJob.profile,
      cronJob.cron,
    )
    if (!created) continue

    task.cron = cronJob.cron
    await appendTaskSystemMessage(runtime.paths.history, 'created', task, {
      createdAt: task.createdAt,
    })
    if (cronJob.profile !== 'manager') {
      enqueueWorkerTask(runtime, task)
      notifyWorkerLoop(runtime)
    }
    if (!cronHasNextRun(cronJob.cron)) {
      cronJob.enabled = false
      cronJob.disabledReason = 'completed'
    }
  }

  if (!stateChanged) return
  await bestEffort('persistRuntimeState: cron_trigger', () =>
    persistRuntimeState(runtime),
  )
}

export const managerLoop = async (runtime: RuntimeState): Promise<void> => {
  while (!runtime.stopped) {
    await bestEffort('checkCronJobs', () => checkCronJobs(runtime))

    const inputPackets = await consumeUserInputs({
      paths: runtime.paths,
      fromCursor: runtime.queues.inputsCursor,
    })
    const allResultPackets = await consumeWorkerResults({
      paths: runtime.paths,
      fromCursor: runtime.queues.resultsCursor,
    })
    const nextInputsCursor =
      inputPackets.at(-1)?.cursor ?? runtime.queues.inputsCursor
    const nextResultsCursor =
      allResultPackets.at(-1)?.cursor ?? runtime.queues.resultsCursor
    const resultPackets = []
    for (const packet of allResultPackets) {
      if (hasNonEmptyTaskId(packet.payload)) {
        resultPackets.push(packet)
        continue
      }
      await bestEffort('appendLog: invalid_worker_result_packet', () =>
        appendLog(runtime.paths.log, {
          event: 'invalid_worker_result_packet',
          packetId: packet.id,
          cursor: packet.cursor,
        }),
      )
    }

    if (inputPackets.length === 0 && resultPackets.length === 0) {
      if (nextResultsCursor !== runtime.queues.resultsCursor) {
        runtime.queues.resultsCursor = nextResultsCursor
        await bestEffort('persistRuntimeState: invalid_result_packet', () =>
          persistRuntimeState(runtime),
        )
        continue
      }
      const executedManagerTasks = await safe(
        'executeManagerProfileTasks',
        () => executeManagerProfileTasks(runtime),
        { fallback: 0 },
      )
      if (executedManagerTasks > 0) continue
      await waitForManagerLoopSignal(runtime, runtime.config.manager.pollMs)
      continue
    }

    const inputs = inputPackets.map((packet) => packet.payload)
    const results = resultPackets.map((packet) => packet.payload)

    runtime.managerRunning = true
    notifyUiSignal(runtime)
    const startedAt = Date.now()
    let assistantAppended = false
    const streamId = createUiStreamId(nextInputsCursor, nextResultsCursor)
    let streamRawOutput = ''
    startUiStream(runtime, streamId)

    try {
      await appendLog(runtime.paths.log, {
        event: 'manager_start',
        inputCount: inputs.length,
        resultCount: results.length,
        inputIds: inputs.map((item) => item.id),
        resultIds: results.map((item) => item.taskId),
      })

      const history = await readHistory(runtime.paths.history)
      const { selected: recentHistory, truncated: truncatedHistory } =
        selectRecentHistory(history, {
          minCount: runtime.config.manager.historyMinCount,
          maxCount: runtime.config.manager.historyMaxCount,
          maxBytes: runtime.config.manager.historyMaxBytes,
        })
      if (truncatedHistory.length > 0) {
        const compacted = buildCompactedSummary(truncatedHistory)
        if (compacted) {
          await bestEffort('appendCompactedSummary', () =>
            appendCompactedSummary(runtime.paths.historyCompacted, compacted),
          )
        }
      }
      const compactedSummaries = await readCompactedSummaries(
        runtime.paths.historyCompacted,
      )
      const compactedContext = formatCompactedContext(compactedSummaries)

      const recentTasks = selectRecentTasks(runtime.tasks, {
        minCount: runtime.config.manager.tasksMinCount,
        maxCount: runtime.config.manager.tasksMaxCount,
        maxBytes: runtime.config.manager.tasksMaxBytes,
      })

      const managerResult = await runManager({
        stateDir: runtime.config.workDir,
        workDir: runtime.config.workDir,
        inputs,
        results,
        tasks: recentTasks,
        cronJobs: runtime.cronJobs,
        history: recentHistory,
        ...(runtime.lastUserMeta
          ? { env: { lastUser: runtime.lastUserMeta } }
          : {}),
        ...(runtime.focusState ? { focusState: runtime.focusState } : {}),
        ...(compactedContext ? { compactedContext } : {}),
        model: runtime.config.manager.model,
        modelReasoningEffort: runtime.config.manager.modelReasoningEffort,
        onTextDelta: (delta) => {
          if (!delta) return
          streamRawOutput += delta
          setUiStreamText(
            runtime,
            streamId,
            toVisibleAssistantText(streamRawOutput),
          )
        },
        onStreamReset: () => {
          streamRawOutput = ''
          resetUiStream(runtime, streamId)
        },
        onUsage: (usage) => {
          setUiStreamUsage(runtime, streamId, usage)
        },
      })

      const focusState = extractFocusState(managerResult.output)
      if (focusState) runtime.focusState = focusState
      const strippedOutput = stripFocusBlock(managerResult.output)
      const parsed = parseActions(strippedOutput)
      const summaries = collectTaskResultSummaries(parsed.actions)
      const hasManualCanceledResult = results.some(
        (result) =>
          result.status === 'canceled' && result.cancel?.source === 'user',
      )

      const consumedInputCount = await appendConsumedInputsToHistory(
        runtime.paths.history,
        inputs,
      )
      if (consumedInputCount < inputs.length)
        throw new Error('append_consumed_inputs_incomplete')

      const consumedResultCount = await appendConsumedResultsToHistory(
        runtime.paths.history,
        runtime.tasks,
        results,
        summaries,
      )
      if (consumedResultCount < results.length)
        throw new Error('append_consumed_results_incomplete')

      await applyTaskActions(runtime, parsed.actions, {
        suppressCreateTask: hasManualCanceledResult && inputs.length === 0,
      })

      const responseText =
        parsed.text.trim() ||
        (await buildFallbackReply({
          inputs,
          results,
        }))
      await appendHistory(runtime.paths.history, {
        id: `assistant-${Date.now()}-${nextInputsCursor}`,
        role: 'assistant',
        text: responseText,
        createdAt: nowIso(),
        ...(managerResult.usage ? { usage: managerResult.usage } : {}),
        ...(managerResult.elapsedMs >= 0
          ? { elapsedMs: managerResult.elapsedMs }
          : {}),
      })
      assistantAppended = true

      await finalizeBatchProgress({
        runtime,
        nextInputsCursor,
        nextResultsCursor,
        consumedInputIds: new Set(inputs.map((item) => item.id)),
        persistRuntime: persistRuntimeState,
      })

      await appendLog(runtime.paths.log, {
        event: 'manager_end',
        status: 'ok',
        elapsedMs: Math.max(0, Date.now() - startedAt),
        ...(managerResult.usage ? { usage: managerResult.usage } : {}),
        ...(managerResult.fallbackUsed ? { fallbackUsed: true } : {}),
      })
    } catch (error) {
      let drainedOnError = false
      try {
        drainedOnError = await drainBatchOnFailure({
          runtime,
          inputs,
          results,
          nextInputsCursor,
          nextResultsCursor,
          persistRuntime: persistRuntimeState,
        })
      } catch (drainError) {
        await logSafeError('managerLoop: drainBatchOnFailure', drainError)
      }

      if (drainedOnError && !assistantAppended && inputs.length > 0) {
        await bestEffort('appendHistory: manager_fallback_reply', () =>
          appendManagerFallbackReply(runtime.paths),
        )
      }

      await bestEffort('appendLog: manager_end_error', () =>
        appendLog(runtime.paths.log, {
          event: 'manager_end',
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          elapsedMs: Math.max(0, Date.now() - startedAt),
          drainedOnError,
          assistantAppended,
        }),
      )

      await bestEffort('persistRuntimeState: manager_error', () =>
        persistRuntimeState(runtime),
      )
    } finally {
      stopUiStream(runtime, streamId)
      runtime.managerRunning = false
      notifyUiSignal(runtime)
    }
  }
}
