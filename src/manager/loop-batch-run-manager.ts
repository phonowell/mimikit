import { parseActions } from '../actions/protocol/parse.js'
import { appendLog } from '../log/append.js'
import { selectRecentHistory } from '../orchestrator/read-model/history-select.js'
import { selectRecentTasks } from '../orchestrator/read-model/task-select.js'
import { readHistory } from '../storage/jsonl.js'

import {
  resetUiStream,
  setUiStreamText,
  setUiStreamUsage,
  toVisibleAssistantText,
} from './loop-ui-stream.js'
import { runManager } from './runner.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskResult, TokenUsage, UserInput } from '../types/index.js'

const buildManagerContext = async (runtime: RuntimeState) => {
  const history = await readHistory(runtime.paths.history)
  const { selected: recentHistory } = selectRecentHistory(history, {
    minCount: runtime.config.manager.historyMinCount,
    maxCount: runtime.config.manager.historyMaxCount,
    maxBytes: runtime.config.manager.historyMaxBytes,
  })
  const recentTasks = selectRecentTasks(runtime.tasks, {
    minCount: runtime.config.manager.tasksMinCount,
    maxCount: runtime.config.manager.tasksMaxCount,
    maxBytes: runtime.config.manager.tasksMaxBytes,
  })

  return { recentHistory, recentTasks }
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

  const { recentHistory, recentTasks } = await buildManagerContext(runtime)

  let streamRawOutput = ''
  let streamUsage: TokenUsage | undefined
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

  setUiStreamText(
    runtime,
    streamId,
    toVisibleAssistantText(managerResult.output),
  )
  if (managerResult.usage) {
    streamUsage =
      setUiStreamUsage(runtime, streamId, managerResult.usage) ?? streamUsage
  }
  if (managerResult.sessionId)
    runtime.plannerSessionId = managerResult.sessionId

  const usage = streamUsage ?? managerResult.usage
  return {
    parsed: parseActions(managerResult.output),
    elapsedMs: managerResult.elapsedMs,
    ...(usage ? { usage } : {}),
  }
}
