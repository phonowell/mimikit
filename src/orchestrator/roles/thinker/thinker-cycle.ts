import { parseActions } from '../../../actions/protocol/parse.js'
import { appendLog } from '../../../log/append.js'
import { bestEffort } from '../../../log/safe.js'
import { readHistory } from '../../../storage/jsonl.js'
import { publishThinkerDecision } from '../../../streams/channels.js'
import { runThinker } from '../../../thinker/runner.js'
import { persistRuntimeState } from '../../core/runtime-persistence.js'
import { selectRecentHistory } from '../../read-model/history-select.js'
import { selectRecentTasks } from '../../read-model/task-select.js'
import {
  appendConsumedInputsToHistory,
  appendConsumedResultsToHistory,
} from '../teller/teller-history.js'

import {
  applyTaskActions,
  collectTaskResultSummaries,
} from './thinker-action-apply.js'
import {
  appendThinkerErrorFeedback,
  publishThinkerErrorDecision,
} from './thinker-cycle-error.js'

import type { TellerDigest } from '../../../types/index.js'
import type { RuntimeState } from '../../core/runtime-state.js'

const DEFAULT_THINKER_TIMEOUT_MS = 30_000

export const runThinkerCycle = async (
  runtime: RuntimeState,
  digest: TellerDigest,
): Promise<void> => {
  runtime.lastThinkerRunAt = Date.now()
  const { inputs } = digest
  const { results } = digest
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

    const parsed = parseActions(result.output)
    const resultSummaries = collectTaskResultSummaries(parsed.actions)

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

    await applyTaskActions(runtime, parsed.actions)

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
      appendThinkerErrorFeedback(runtime, error),
    )
    await publishThinkerErrorDecision(runtime, digest)
  } finally {
    await bestEffort('persistRuntimeState: thinker', () =>
      persistRuntimeState(runtime),
    )
    runtime.thinkerRunning = false
  }
}
