import { parseActions } from '../actions/protocol/parse.js'
import { appendLog } from '../log/append.js'
import { selectRecentTasks } from '../orchestrator/read-model/task-select.js'
import { readHistory } from '../storage/history-jsonl.js'

import { collectManagerActionFeedback } from './action-feedback.js'
import { pickQueryHistoryRequest, queryHistory } from './history-query.js'
import { appendActionFeedbackSystemMessage } from './history.js'
import {
  resetUiStream,
  setUiStreamText,
  setUiStreamUsage,
  toVisibleAgentText,
} from './loop-ui-stream.js'
import { runManager } from './runner.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type {
  HistoryLookupMessage,
  ManagerActionFeedback,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'

const STREAM_TEXT_FLUSH_MS = 64

export const runManagerBatch = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  results: TaskResult[]
  streamId: string
}): Promise<{
  parsed: ReturnType<typeof parseActions>
  usage?: TokenUsage
  elapsedMs: number
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

  let streamRawOutput = ''
  let streamVisibleOutput = ''
  let streamUsage: TokenUsage | undefined
  let streamFlushTimer: ReturnType<typeof setTimeout> | null = null

  const clearStreamFlushTimer = (): void => {
    if (!streamFlushTimer) return
    clearTimeout(streamFlushTimer)
    streamFlushTimer = null
  }

  const flushVisibleStream = (): void => {
    streamFlushTimer = null
    const nextVisible = toVisibleAgentText(streamRawOutput)
    if (nextVisible !== streamVisibleOutput) {
      streamVisibleOutput = nextVisible
      setUiStreamText(runtime, streamId, nextVisible)
    }
    if (!streamUsage) return
    streamUsage =
      setUiStreamUsage(runtime, streamId, streamUsage) ?? streamUsage
  }

  const scheduleVisibleStreamFlush = (): void => {
    if (streamFlushTimer) return
    streamFlushTimer = setTimeout(flushVisibleStream, STREAM_TEXT_FLUSH_MS)
  }

  const runOnce = async (extra?: {
    historyLookup?: HistoryLookupMessage[]
    actionFeedback?: ManagerActionFeedback[]
  }) => {
    const result = await runManager({
      stateDir: runtime.config.workDir,
      workDir: runtime.config.workDir,
      inputs,
      results,
      tasks,
      cronJobs: runtime.cronJobs,
      ...(extra?.historyLookup ? { historyLookup: extra.historyLookup } : {}),
      ...(extra?.actionFeedback
        ? { actionFeedback: extra.actionFeedback }
        : {}),
      ...(runtime.managerCompressedContext
        ? { compressedContext: runtime.managerCompressedContext }
        : {}),
      ...(runtime.lastUserMeta
        ? { env: { lastUser: runtime.lastUserMeta } }
        : {}),
      model: runtime.config.manager.model,
      modelReasoningEffort: runtime.config.manager.modelReasoningEffort,
      ...(runtime.plannerSessionId
        ? { sessionId: runtime.plannerSessionId }
        : {}),
      maxPromptTokens: runtime.config.manager.prompt.maxTokens,
      onTextDelta: (delta) => {
        if (!delta) return
        streamRawOutput += delta
        scheduleVisibleStreamFlush()
      },
      onStreamReset: () => {
        clearStreamFlushTimer()
        streamRawOutput = ''
        streamVisibleOutput = ''
        resetUiStream(runtime, streamId)
      },
      onUsage: (usage) => {
        streamUsage = usage
        scheduleVisibleStreamFlush()
      },
    })
    if (result.sessionId) runtime.plannerSessionId = result.sessionId
    if (result.usage) {
      streamUsage = result.usage
      scheduleVisibleStreamFlush()
    }
    return result
  }
  let elapsedMs = 0
  let previousQueryKey: string | undefined
  let extra: {
    historyLookup?: HistoryLookupMessage[]
    actionFeedback?: ManagerActionFeedback[]
  } = {}

  try {
    for (;;) {
      const runResult = await runOnce(extra)
      elapsedMs += runResult.elapsedMs
      const parsed = parseActions(runResult.output)
      if (streamVisibleOutput !== parsed.text) {
        clearStreamFlushTimer()
        flushVisibleStream()
        streamVisibleOutput = parsed.text
        setUiStreamText(runtime, streamId, parsed.text)
      }
      const scheduleNowIso =
        runtime.lastUserMeta?.clientNowIso ?? new Date().toISOString()
      const actionFeedback = collectManagerActionFeedback(parsed.actions, {
        taskStatusById: new Map(
          runtime.tasks.map((task) => [task.id, task.status]),
        ),
        enabledCronJobIds: new Set(
          runtime.cronJobs.filter((job) => job.enabled).map((job) => job.id),
        ),
        hasPlannerSession: Boolean(runtime.plannerSessionId),
        scheduleNowIso,
      })
      const queryRequest = pickQueryHistoryRequest(parsed.actions)
      const queryKey = queryRequest
        ? [
            queryRequest.query,
            String(queryRequest.limit),
            queryRequest.roles.join(','),
            queryRequest.beforeId ?? '',
            String(queryRequest.fromMs ?? ''),
            String(queryRequest.toMs ?? ''),
          ].join('\n')
        : undefined

      if (!queryRequest && actionFeedback.length === 0) {
        clearStreamFlushTimer()
        flushVisibleStream()
        if (streamVisibleOutput !== parsed.text) {
          streamVisibleOutput = parsed.text
          setUiStreamText(runtime, streamId, parsed.text)
        }
        return {
          parsed,
          elapsedMs,
          ...((streamUsage ?? runResult.usage)
            ? { usage: streamUsage ?? runResult.usage }
            : {}),
        }
      }
      if (
        queryKey &&
        actionFeedback.length === 0 &&
        previousQueryKey === queryKey
      )
        throw new Error('manager_query_history_repeated_without_progress')
      previousQueryKey = queryKey

      let historyLookup: HistoryLookupMessage[] | undefined
      if (queryRequest) {
        const history = await readHistory(runtime.paths.history)
        historyLookup = queryHistory(history, queryRequest)
        await appendLog(runtime.paths.log, {
          event: 'manager_query_history',
          queryChars: queryRequest.query.length,
          limit: queryRequest.limit,
          roleCount: queryRequest.roles.length,
          resultCount: historyLookup.length,
          ...(queryRequest.beforeId ? { beforeId: queryRequest.beforeId } : {}),
          ...(queryRequest.fromMs !== undefined
            ? { fromMs: queryRequest.fromMs }
            : {}),
          ...(queryRequest.toMs !== undefined
            ? { toMs: queryRequest.toMs }
            : {}),
        })
      }
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
        )
      }

      clearStreamFlushTimer()
      flushVisibleStream()
      streamRawOutput = ''
      streamVisibleOutput = ''
      resetUiStream(runtime, streamId)
      extra = {
        ...(historyLookup ? { historyLookup } : {}),
        ...(actionFeedback.length > 0 ? { actionFeedback } : {}),
      }
    }
  } finally {
    clearStreamFlushTimer()
  }
}
