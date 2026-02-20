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
  toVisibleAssistantText,
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
    minCount: runtime.config.deferred.tasksMinCount,
    maxCount: runtime.config.deferred.tasksMaxCount,
    maxBytes: runtime.config.deferred.tasksMaxBytes,
  })

  let streamRawOutput = ''
  let streamUsage: TokenUsage | undefined
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
      ...(runtime.lastUserMeta
        ? { env: { lastUser: runtime.lastUserMeta } }
        : {}),
      model: runtime.config.deferred.model,
      ...(runtime.plannerSessionId
        ? { sessionId: runtime.plannerSessionId }
        : {}),
      maxPromptTokens: runtime.config.deferred.promptMaxTokens,
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
        streamUsage = setUiStreamUsage(runtime, streamId, usage) ?? streamUsage
      },
    })
    if (result.sessionId) runtime.plannerSessionId = result.sessionId
    if (result.usage) {
      streamUsage =
        setUiStreamUsage(runtime, streamId, result.usage) ?? streamUsage
    }
    return result
  }

  const first = await runOnce()
  const firstParsed = parseActions(first.output)
  const actionFeedback = collectManagerActionFeedback(firstParsed.actions, {
    taskStatusById: new Map(
      runtime.tasks.map((task) => [task.id, task.status]),
    ),
    enabledCronJobIds: new Set(
      runtime.cronJobs.filter((job) => job.enabled).map((job) => job.id),
    ),
  })

  const queryRequest = pickQueryHistoryRequest(firstParsed.actions)
  if (!queryRequest && actionFeedback.length === 0) {
    setUiStreamText(runtime, streamId, toVisibleAssistantText(first.output))
    return {
      parsed: firstParsed,
      elapsedMs: first.elapsedMs,
      ...((streamUsage ?? first.usage)
        ? { usage: streamUsage ?? first.usage }
        : {}),
    }
  }

  let lookup: HistoryLookupMessage[] | undefined
  if (queryRequest) {
    const history = await readHistory(runtime.paths.history)
    lookup = queryHistory(history, queryRequest)
    await appendLog(runtime.paths.log, {
      event: 'manager_query_history',
      queryChars: queryRequest.query.length,
      limit: queryRequest.limit,
      roleCount: queryRequest.roles.length,
      resultCount: lookup.length,
      ...(queryRequest.beforeId ? { beforeId: queryRequest.beforeId } : {}),
      ...(queryRequest.fromMs !== undefined
        ? { fromMs: queryRequest.fromMs }
        : {}),
      ...(queryRequest.toMs !== undefined ? { toMs: queryRequest.toMs } : {}),
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

  streamRawOutput = ''
  resetUiStream(runtime, streamId)
  const second = await runOnce({
    ...(lookup ? { historyLookup: lookup } : {}),
    ...(actionFeedback.length > 0 ? { actionFeedback } : {}),
  })
  const secondParsed = parseActions(second.output)
  setUiStreamText(runtime, streamId, toVisibleAssistantText(second.output))
  return {
    parsed: secondParsed,
    elapsedMs: first.elapsedMs + second.elapsedMs,
    ...((streamUsage ?? second.usage ?? first.usage)
      ? { usage: streamUsage ?? second.usage ?? first.usage }
      : {}),
  }
}
