import { parseActions } from '../actions/protocol/parse.js'
import { appendLog } from '../log/append.js'
import { bestEffort, logSafeError } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { enqueueTask } from '../orchestrator/core/task-state.js'
import { notifyWorkerLoop } from '../orchestrator/core/worker-signal.js'
import { selectRecentHistory } from '../orchestrator/read-model/history-select.js'
import { appendTaskSystemMessage } from '../orchestrator/read-model/task-history.js'
import { selectRecentTasks } from '../orchestrator/read-model/task-select.js'
import { nowIso, sleep } from '../shared/utils.js'
import { appendHistory, readHistory } from '../storage/jsonl.js'
import { consumeUserInputs, consumeWorkerResults } from '../streams/queues.js'
import { matchCronNow } from '../tasks/cron.js'
import { enqueueWorkerTask } from '../worker/dispatch.js'

import { applyTaskActions, collectTaskResultSummaries } from './action-apply.js'
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
import { runManager } from './runner.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

const asSecondStamp = (iso: string): string => iso.slice(0, 19)

const checkCronJobs = async (runtime: RuntimeState): Promise<void> => {
  if (runtime.cronJobs.length === 0) return

  const now = new Date()
  const nowAtIso = now.toISOString()
  const nowSecond = asSecondStamp(nowAtIso)

  let stateChanged = false
  for (const cronJob of runtime.cronJobs) {
    if (!cronJob.enabled) continue
    if (
      cronJob.lastTriggeredAt &&
      asSecondStamp(cronJob.lastTriggeredAt) === nowSecond
    )
      continue

    let matched = false
    try {
      matched = matchCronNow(cronJob.cron, now)
    } catch {
      matched = false
    }
    if (!matched) continue

    cronJob.lastTriggeredAt = nowAtIso
    stateChanged = true

    const { task, created } = enqueueTask(
      runtime.tasks,
      cronJob.prompt,
      cronJob.title,
      cronJob.profile,
      cronJob.next ? [cronJob.next] : undefined,
    )
    if (!created) continue

    await appendTaskSystemMessage(runtime.paths.history, 'created', task, {
      createdAt: task.createdAt,
    })
    enqueueWorkerTask(runtime, task)
    notifyWorkerLoop(runtime)
  }

  if (!stateChanged) return
  await bestEffort('persistRuntimeState: cron_trigger', () =>
    persistRuntimeState(runtime),
  )
}

export const managerLoop = async (runtime: RuntimeState): Promise<void> => {
  while (!runtime.stopped) {
    await bestEffort('checkCronJobs', () => checkCronJobs(runtime))

    const now = Date.now()
    const throttled =
      runtime.lastManagerRunAt !== undefined &&
      now - runtime.lastManagerRunAt < runtime.config.manager.minIntervalMs
    if (throttled) {
      await sleep(runtime.config.manager.pollMs)
      continue
    }

    const inputPackets = await consumeUserInputs({
      paths: runtime.paths,
      fromCursor: runtime.queues.inputsCursor,
    })
    const resultPackets = await consumeWorkerResults({
      paths: runtime.paths,
      fromCursor: runtime.queues.resultsCursor,
    })

    if (inputPackets.length === 0 && resultPackets.length === 0) {
      await sleep(runtime.config.manager.pollMs)
      continue
    }

    const nextInputsCursor =
      inputPackets.at(-1)?.cursor ?? runtime.queues.inputsCursor
    const nextResultsCursor =
      resultPackets.at(-1)?.cursor ?? runtime.queues.resultsCursor
    const inputs = inputPackets.map((packet) => packet.payload)
    const results = resultPackets.map((packet) => packet.payload)

    runtime.managerRunning = true
    runtime.lastManagerRunAt = now
    const startedAt = Date.now()
    let assistantAppended = false

    try {
      await appendLog(runtime.paths.log, {
        event: 'manager_start',
        inputCount: inputs.length,
        resultCount: results.length,
        inputIds: inputs.map((item) => item.id),
        resultIds: results.map((item) => item.taskId),
      })

      const history = await readHistory(runtime.paths.history)
      const recentHistory = selectRecentHistory(history, {
        minCount: runtime.config.manager.historyMinCount,
        maxCount: runtime.config.manager.historyMaxCount,
        maxBytes: runtime.config.manager.historyMaxBytes,
      })
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
        history: recentHistory,
        ...(runtime.lastUserMeta
          ? { env: { lastUser: runtime.lastUserMeta } }
          : {}),
        model: runtime.config.manager.model,
        modelReasoningEffort: runtime.config.manager.modelReasoningEffort,
      })

      const parsed = parseActions(managerResult.output)
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
      runtime.managerRunning = false
    }
  }
}
