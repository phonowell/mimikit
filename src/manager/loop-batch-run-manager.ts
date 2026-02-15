import { parseActions } from '../actions/protocol/parse.js'
import { appendLog } from '../log/append.js'
import { selectRecentTasks } from '../orchestrator/read-model/task-select.js'
import { readHistory } from '../storage/jsonl.js'

import { pickQueryHistoryRequest, queryHistory } from './history-query.js'
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
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'

const buildManagerContext = (runtime: RuntimeState) => {
  const recentTasks = selectRecentTasks(runtime.tasks, {
    minCount: runtime.config.manager.tasksMinCount,
    maxCount: runtime.config.manager.tasksMaxCount,
    maxBytes: runtime.config.manager.tasksMaxBytes,
  })
  return { recentTasks }
}

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

  const { recentTasks } = buildManagerContext(runtime)

  let streamRawOutput = ''
  let streamUsage: TokenUsage | undefined
  const runOnce = async (
    historyLookup?: HistoryLookupMessage[],
  ): Promise<Awaited<ReturnType<typeof runManager>>> => {
    const managerResult = await runManager({
      stateDir: runtime.config.workDir,
      workDir: runtime.config.workDir,
      inputs,
      results,
      tasks: recentTasks,
      cronJobs: runtime.cronJobs,
      ...(historyLookup ? { historyLookup } : {}),
      ...(runtime.lastUserMeta
        ? { env: { lastUser: runtime.lastUserMeta } }
        : {}),
      model: runtime.config.manager.model,
      ...(runtime.plannerSessionId
        ? { sessionId: runtime.plannerSessionId }
        : {}),
      maxPromptTokens: runtime.config.manager.promptMaxTokens,
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
    if (managerResult.sessionId)
      runtime.plannerSessionId = managerResult.sessionId
    if (managerResult.usage) {
      streamUsage =
        setUiStreamUsage(runtime, streamId, managerResult.usage) ?? streamUsage
    }
    return managerResult
  }

  const first = await runOnce()
  const firstParsed = parseActions(first.output)
  const queryRequest = pickQueryHistoryRequest(firstParsed.actions)
  if (!queryRequest) {
    setUiStreamText(runtime, streamId, toVisibleAssistantText(first.output))
    const usage = streamUsage ?? first.usage
    return {
      parsed: firstParsed,
      elapsedMs: first.elapsedMs,
      ...(usage ? { usage } : {}),
    }
  }

  const history = await readHistory(runtime.paths.history)
  const lookup = queryHistory(history, queryRequest)
  await appendLog(runtime.paths.log, {
    event: 'manager_query_history',
    queryChars: queryRequest.query.length,
    limit: queryRequest.limit,
    roleCount: queryRequest.roles.length,
    resultCount: lookup.length,
    ...(queryRequest.beforeId ? { beforeId: queryRequest.beforeId } : {}),
  })

  streamRawOutput = ''
  resetUiStream(runtime, streamId)
  const second = await runOnce(lookup)
  const secondParsed = parseActions(second.output)
  setUiStreamText(runtime, streamId, toVisibleAssistantText(second.output))
  const usage = streamUsage ?? second.usage ?? first.usage
  return {
    parsed: secondParsed,
    elapsedMs: first.elapsedMs + second.elapsedMs,
    ...(usage ? { usage } : {}),
  }
}
