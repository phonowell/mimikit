import { appendRuntimeSignalFeedback } from '../evolve/feedback.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { sleep } from '../shared/utils.js'
import { readHistory } from '../storage/jsonl.js'
import {
  consumeTellerDigests,
  publishThinkerDecision,
} from '../streams/channels.js'
import { runThinker } from '../thinker/runner.js'

import { parseCommands } from './command-parser.js'
import { selectRecentHistory } from './history-select.js'
import { persistRuntimeState } from './runtime-persist.js'
import { selectRecentTasks } from './task-select.js'
import {
  appendConsumedInputsToHistory,
  appendConsumedResultsToHistory,
} from './teller-history.js'
import {
  collectResultSummaries,
  processThinkerCommands,
} from './thinker-commands.js'

import type { RuntimeState } from './runtime-state.js'
import type { TellerDigest } from '../types/index.js'

const DEFAULT_THINKER_TIMEOUT_MS = 30_000

const THINKER_ERROR_REPLY = '抱歉，我刚刚处理失败了。我会马上重试并继续推进。'

const runThinkerCycle = async (
  runtime: RuntimeState,
  digest: TellerDigest,
): Promise<void> => {
  runtime.lastThinkerRunAt = Date.now()
  const { inputs, results } = digest
  const history = await readHistory(runtime.paths.history)
  const recentHistory = selectRecentHistory(history, {
    minCount: runtime.config.thinker.historyMinCount,
    maxCount: runtime.config.thinker.historyMaxCount,
    maxBytes: runtime.config.thinker.historyMaxBytes,
  })
  const recentTasks = selectRecentTasks(runtime.tasks, {
    minCount: runtime.config.thinker.tasksMinCount,
    maxCount: runtime.config.thinker.tasksMaxCount,
    maxBytes: runtime.config.thinker.tasksMaxBytes,
  })
  const startedAt = Date.now()
  runtime.thinkerRunning = true
  let consumedInputCount = 0
  let consumedResultCount = 0
  try {
    const { model, modelReasoningEffort } = runtime.config.thinker
    await appendLog(runtime.paths.log, {
      event: 'thinker_start',
      inputCount: inputs.length,
      resultCount: results.length,
      historyCount: recentHistory.length,
      inputIds: inputs.map((input) => input.id),
      resultIds: results.map((result) => result.taskId),
      pendingTaskCount: runtime.tasks.filter(
        (task) => task.status === 'pending',
      ).length,
      ...(model ? { model } : {}),
    })

    const result = await runThinker({
      stateDir: runtime.config.stateDir,
      workDir: runtime.config.workDir,
      inputs,
      results,
      tasks: recentTasks,
      history: recentHistory,
      env: {
        ...(runtime.lastUserMeta ? { lastUser: runtime.lastUserMeta } : {}),
        tellerDigestSummary: digest.summary,
        taskSummary: digest.taskSummary,
      },
      timeoutMs: DEFAULT_THINKER_TIMEOUT_MS,
      model,
      modelReasoningEffort,
    })

    const parsed = parseCommands(result.output)
    const resultSummaries = collectResultSummaries(parsed.commands)

    consumedInputCount = await appendConsumedInputsToHistory(
      runtime.paths.history,
      inputs,
    )
    if (consumedInputCount < inputs.length)
      throw new Error('append_consumed_inputs_incomplete')
    consumedResultCount = await appendConsumedResultsToHistory(
      runtime.paths.history,
      runtime.tasks,
      results,
      resultSummaries,
    )
    if (consumedResultCount < results.length)
      throw new Error('append_consumed_results_incomplete')
    await processThinkerCommands(runtime, parsed.commands)
    await publishThinkerDecision({
      paths: runtime.paths,
      payload: {
        digestId: digest.digestId,
        decision: parsed.text,
        inputIds: inputs.map((input) => input.id),
        taskSummary: digest.taskSummary,
      },
    })
    await appendLog(runtime.paths.log, {
      event: 'thinker_end',
      status: 'ok',
      elapsedMs: result.elapsedMs,
      ...(result.usage ? { usage: result.usage } : {}),
      ...(result.fallbackUsed ? { fallbackUsed: true } : {}),
    })
  } catch (error) {
    await bestEffort('appendHistory: thinker_error_inputs', async () => {
      consumedInputCount += await appendConsumedInputsToHistory(
        runtime.paths.history,
        inputs.slice(consumedInputCount),
      )
    })
    await bestEffort('appendHistory: thinker_error_results', async () => {
      consumedResultCount += await appendConsumedResultsToHistory(
        runtime.paths.history,
        runtime.tasks,
        results.slice(consumedResultCount),
      )
    })
    await bestEffort('appendLog: thinker_end', () =>
      appendLog(runtime.paths.log, {
        event: 'thinker_end',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Math.max(0, Date.now() - startedAt),
        ...(consumedInputCount > 0 ? { consumedInputCount } : {}),
        ...(consumedResultCount > 0 ? { consumedResultCount } : {}),
      }),
    )
    await bestEffort('appendEvolveFeedback: thinker_error', () =>
      appendRuntimeSignalFeedback({
        stateDir: runtime.config.stateDir,
        severity: 'high',
        message: `thinker error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        extractedIssue: {
          kind: 'issue',
          issue: {
            title: `thinker error: ${
              error instanceof Error ? error.message : String(error)
            }`,
            category: 'failure',
            confidence: 0.95,
            roiScore: 90,
            action: 'fix',
            rationale: 'thinker runtime failure',
            fingerprint: 'thinker_error',
          },
        },
        evidence: {
          event: 'thinker_error',
        },
        context: {
          note: 'thinker_error',
        },
      }).then(() => undefined),
    )
    await publishThinkerDecision({
      paths: runtime.paths,
      payload: {
        digestId: digest.digestId,
        decision: THINKER_ERROR_REPLY,
        inputIds: inputs.map((input) => input.id),
        taskSummary: digest.taskSummary,
      },
    })
  } finally {
    await bestEffort('persistRuntimeState: thinker', () =>
      persistRuntimeState(runtime),
    )
    runtime.thinkerRunning = false
  }
}

export const thinkerLoop = async (runtime: RuntimeState): Promise<void> => {
  while (!runtime.stopped) {
    const now = Date.now()
    const throttled =
      runtime.lastThinkerRunAt &&
      now - runtime.lastThinkerRunAt < runtime.config.thinker.minIntervalMs
    if (throttled) {
      await sleep(runtime.config.thinker.pollMs)
      continue
    }
    const packets = await consumeTellerDigests({
      paths: runtime.paths,
      fromCursor: runtime.channels.thinkerTellerDigestCursor,
      limit: 1,
    })
    const packet = packets[0]
    if (!packet) {
      await sleep(runtime.config.thinker.pollMs)
      continue
    }
    runtime.channels.thinkerTellerDigestCursor = packet.cursor
    await runThinkerCycle(runtime, packet.payload)
    await bestEffort('persistRuntimeState: thinker_cursor', () =>
      persistRuntimeState(runtime),
    )
  }
}
