import { executeCommands } from '../commands/executor.js'
import { parseCommands } from '../commands/parser.js'
import { appendLog } from '../log/append.js'
import { safe } from '../log/safe.js'
import { runThinker } from '../roles/runner.js'
import { sleep } from '../shared/sleep.js'
import { listJsonPaths } from '../storage/dir.js'
import { takeTaskResults } from '../storage/task-results.js'
import { listTasks } from '../storage/tasks.js'
import {
  readThinkerState,
  writeThinkerState,
} from '../storage/thinker-state.js'
import {
  hasUnprocessedUserInputs,
  takeUnprocessedUserInputs,
} from '../storage/user-inputs.js'
import { nowIso } from '../time.js'

import type { RuntimeState } from './runtime.js'

const DEFAULT_THINKER_TIMEOUT_MS = 120_000

const hasPendingResults = async (
  paths: RuntimeState['paths'],
): Promise<boolean> => {
  const entries = await listJsonPaths(paths.agentResults)
  return entries.length > 0
}

const canWake = async (runtime: RuntimeState): Promise<boolean> => {
  if (runtime.thinkerRunning) return false
  const hasInputs = await hasUnprocessedUserInputs(runtime.paths.userInputs)
  const resultsPending = await hasPendingResults(runtime.paths)
  if (!hasInputs && !resultsPending) return false
  if (hasInputs) {
    if (runtime.lastTellerReplyAt <= runtime.lastUserInputAt) return false
    if (Date.now() - runtime.lastUserInputAt < runtime.config.thinker.settleMs)
      return false
  }
  return true
}

const runThinkerOnce = async (runtime: RuntimeState): Promise<void> => {
  const startedAt = Date.now()
  let sessionId: string | null = null
  let inputs: Awaited<ReturnType<typeof takeUnprocessedUserInputs>> = []
  let results: Awaited<ReturnType<typeof takeTaskResults>> = []
  let tasks: Awaited<ReturnType<typeof listTasks>> = []

  try {
    const state = await readThinkerState(runtime.paths.thinkerState)
    sessionId = state.sessionId ? state.sessionId : null
    inputs = await takeUnprocessedUserInputs(runtime.paths.userInputs)
    results = await takeTaskResults(runtime.paths.agentResults)
    tasks = await listTasks(runtime.paths.agentQueue)
    await appendLog(runtime.paths.log, {
      event: 'thinker_start',
      inputCount: inputs.length,
      resultCount: results.length,
      taskCount: tasks.length,
      inputIds: inputs.map((input) => input.id),
      resultIds: results.map((result) => result.taskId),
      sessionId,
    })

    const llmResult = await runThinker({
      workDir: runtime.config.workDir,
      state,
      inputs,
      results,
      tasks,
      timeoutMs: DEFAULT_THINKER_TIMEOUT_MS,
      threadId: sessionId,
    })

    const parsed = parseCommands(llmResult.output)
    await executeCommands(parsed.commands, { paths: runtime.paths })

    const updated = await readThinkerState(runtime.paths.thinkerState)
    await writeThinkerState(runtime.paths.thinkerState, {
      ...updated,
      sessionId: llmResult.threadId ?? updated.sessionId,
      lastWakeAt: nowIso(),
    })

    await appendLog(runtime.paths.log, {
      event: 'thinker_end',
      status: 'ok',
      elapsedMs: llmResult.elapsedMs,
      ...(llmResult.usage ? { usage: llmResult.usage } : {}),
    })
    runtime.thinkerLast = {
      elapsedMs: llmResult.elapsedMs,
      ...(llmResult.usage ? { usage: llmResult.usage } : {}),
      endedAt: nowIso(),
    }
  } catch (error) {
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    await safe(
      'appendLog: thinker_end',
      () =>
        appendLog(runtime.paths.log, {
          event: 'thinker_end',
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          elapsedMs,
          inputCount: inputs.length,
          resultCount: results.length,
          taskCount: tasks.length,
          sessionId,
        }),
      { fallback: undefined },
    )
    runtime.thinkerLast = {
      elapsedMs,
      endedAt: nowIso(),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export const thinkerLoop = async (runtime: RuntimeState): Promise<void> => {
  while (!runtime.stopped) {
    try {
      if (await canWake(runtime)) {
        runtime.thinkerRunning = true
        await runThinkerOnce(runtime)
        runtime.thinkerRunning = false
      }
    } catch (error) {
      runtime.thinkerRunning = false
      await safe(
        'appendLog: thinker_loop_error',
        () =>
          appendLog(runtime.paths.log, {
            event: 'thinker_loop_error',
            error: error instanceof Error ? error.message : String(error),
          }),
        { fallback: undefined },
      )
    }
    await sleep(1000)
  }
}
