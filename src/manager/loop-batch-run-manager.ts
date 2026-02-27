import { parseActions } from '../actions/protocol/parse.js'
import {
  collectPreferredFocusIds,
  resolveDefaultFocusId,
  selectWorkingFocusIds,
} from '../focus/index.js'
import { appendLog } from '../log/append.js'
import {
  selectRecentIntents,
  selectRecentTasks,
} from '../orchestrator/read-model/intent-select.js'
import { mergeUsageAdditive } from '../shared/token-usage.js'

import { collectManagerActionFeedback } from './action-feedback-collect.js'
import { pickQueryHistoryRequest } from '../history/query.js'
import { appendActionFeedbackSystemMessage } from '../history/manager-events.js'
import {
  buildHistoryQueryKey,
  collectTriggeredIntentIds,
  queryHistoryLookup,
} from './loop-batch-context.js'
import {
  runManagerRoundWithRecovery,
} from './loop-batch-exec.js'
import { createManagerStreamController } from './loop-batch-stream-controller.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type {
  HistoryLookupMessage,
  ManagerActionFeedback,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'

export const runManagerBatch = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  results: TaskResult[]
  streamId: string
}): Promise<{
  parsed: ReturnType<typeof parseActions>
  usage?: TokenUsage
  elapsedMs: number
  roundLimitReached?: boolean
}> => {
  const { runtime, inputs, results, streamId } = params
  await appendLog(runtime.paths.log, {
    event: 'manager_start',
    inputCount: inputs.length,
    resultCount: results.length,
    inputIds: inputs.map((item) => item.id),
    resultIds: results.map((item) => item.taskId),
  })

  const tasks = selectRecentTasks(runtime.tasks, {
    minCount: runtime.config.manager.taskWindow.minCount,
    maxCount: runtime.config.manager.taskWindow.maxCount,
    maxBytes: runtime.config.manager.taskWindow.maxBytes,
  })
  const triggerIntentIds = collectTriggeredIntentIds(inputs)
  const intentsSource = [
    ...runtime.idleIntents,
    ...runtime.idleIntentArchive,
  ].filter((intent) => !triggerIntentIds.has(intent.id))
  const intents = selectRecentIntents(intentsSource, {
    minCount: runtime.config.manager.intentWindow.minCount,
    maxCount: runtime.config.manager.intentWindow.maxCount,
    maxBytes: runtime.config.manager.intentWindow.maxBytes,
  })
  const preferredFocusIds = collectPreferredFocusIds(runtime, inputs, results)
  const workingFocusIds = selectWorkingFocusIds(runtime, preferredFocusIds)
  const stream = createManagerStreamController({ runtime, streamId })

  let elapsedMs = 0
  let batchUsage: TokenUsage | undefined
  let previousQueryKey: string | undefined
  let extra: {
    historyLookup?: HistoryLookupMessage[]
    actionFeedback?: ManagerActionFeedback[]
  } = {}
  let lastParsed = parseActions('')
  const maxCorrectionRounds = Math.max(
    1,
    runtime.config.manager.maxCorrectionRounds,
  )

  try {
    for (let round = 1; round <= maxCorrectionRounds; round++) {
      const runResult = await runManagerRoundWithRecovery({
        runtime,
        round,
        inputs,
        results,
        tasks,
        intents,
        workingFocusIds,
        extra,
        onTextDelta: stream.appendDelta,
        onUsage: stream.setUsage,
      })

      if (runResult.usage) stream.setUsage(runResult.usage)
      elapsedMs += runResult.elapsedMs
      batchUsage = mergeUsageAdditive(batchUsage, runResult.usage)

      const parsed = parseActions(runResult.output)
      lastParsed = parsed
      stream.commitParsedText(parsed.text)
      const scheduleNowIso =
        runtime.lastUserMeta?.clientNowIso ?? new Date().toISOString()

      const actionFeedback = collectManagerActionFeedback(parsed.actions, {
        taskStatusById: new Map(
          runtime.tasks.map((task) => [task.id, task.status]),
        ),
        enabledCronJobIds: new Set(
          runtime.cronJobs.filter((job) => job.enabled).map((job) => job.id),
        ),
        intentStatusById: new Map(
          [...runtime.idleIntents, ...runtime.idleIntentArchive].map(
            (intent) => [intent.id, intent.status],
          ),
        ),
        hasCompressibleContext:
          Boolean(runtime.managerCompressedContext?.trim()) ||
          runtime.tasks.length > 0 ||
          inputs.length > 0 ||
          results.length > 0 ||
          runtime.queues.inputsCursor > 0 ||
          runtime.queues.resultsCursor > 0,
        scheduleNowIso,
      })

      const queryRequest = pickQueryHistoryRequest(parsed.actions)
      const queryKey = buildHistoryQueryKey(queryRequest)

      if (!queryRequest && actionFeedback.length === 0) {
        stream.commitParsedText(parsed.text)
        return {
          parsed,
          elapsedMs,
          ...(batchUsage ? { usage: batchUsage } : {}),
        }
      }

      if (
        queryKey &&
        actionFeedback.length === 0 &&
        previousQueryKey === queryKey
      ) {
        throw new Error('manager_query_history_repeated_without_progress')
      }
      previousQueryKey = queryKey

      const historyLookup = await queryHistoryLookup(runtime, queryRequest)
      if (actionFeedback.length > 0) {
        await appendLog(runtime.paths.log, {
          event: 'manager_action_feedback',
          count: actionFeedback.length,
          errors: actionFeedback.map((item) => item.error),
          names: actionFeedback.map((item) => item.action),
        })
        await appendActionFeedbackSystemMessage(
          runtime.paths.history,
          actionFeedback,
          resolveDefaultFocusId(runtime),
        )
      }

      stream.resetCycle()
      extra = {
        ...(historyLookup ? { historyLookup } : {}),
        ...(actionFeedback.length > 0 ? { actionFeedback } : {}),
      }
    }

    await appendLog(runtime.paths.log, {
      event: 'manager_correction_round_limit_reached',
      maxCorrectionRounds,
    })
    return {
      parsed: {
        text: lastParsed.text,
        actions: [],
      },
      elapsedMs,
      ...(batchUsage ? { usage: batchUsage } : {}),
      roundLimitReached: true,
    }
  } finally {
    stream.teardown()
  }
}
