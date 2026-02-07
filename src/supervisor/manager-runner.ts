import { appendRuntimeSignalFeedback } from '../evolve/feedback.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { runManager } from '../roles/runner.js'
import { nowIso } from '../shared/utils.js'
import { appendHistory, readHistory } from '../storage/jsonl.js'

import { parseCommands } from './command-parser.js'
import { selectRecentHistory } from './history-select.js'
import {
  clearManagerBuffer,
  type ManagerBuffer,
  syncManagerPendingInputs,
} from './manager-buffer.js'
import {
  appendConsumedInputsToHistory,
  appendConsumedResultsToHistory,
  appendFallbackReply,
} from './manager-history.js'
import {
  collectResultSummaries,
  processManagerCommands,
} from './manager-runner-commands.js'
import { persistRuntimeState } from './runtime-persist.js'
import { selectRecentTasks } from './task-select.js'

import type { RuntimeState } from './runtime.js'

const DEFAULT_MANAGER_TIMEOUT_MS = 30_000

export const runManagerBuffer = async (
  runtime: RuntimeState,
  buffer: ManagerBuffer,
): Promise<void> => {
  const { inputs } = buffer
  const { results } = buffer
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
  const startedAt = Date.now()
  runtime.managerRunning = true
  let consumedInputCount = 0
  let consumedResultCount = 0
  try {
    const { model, modelReasoningEffort } = runtime.config.manager
    await appendLog(runtime.paths.log, {
      event: 'manager_start',
      inputCount: inputs.length,
      resultCount: results.length,
      historyCount: recentHistory.length,
      inputIds: buffer.inputs.map((input) => input.id),
      resultIds: results.map((result) => result.taskId),
      pendingTaskCount: runtime.tasks.filter(
        (task) => task.status === 'pending',
      ).length,
      ...(model ? { model } : {}),
    })

    const result = await runManager({
      stateDir: runtime.config.stateDir,
      workDir: runtime.config.workDir,
      inputs,
      results,
      tasks: recentTasks,
      history: recentHistory,
      ...(runtime.lastUserMeta
        ? { env: { lastUser: runtime.lastUserMeta } }
        : {}),
      timeoutMs: DEFAULT_MANAGER_TIMEOUT_MS,
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
    await processManagerCommands(runtime, parsed.commands)
    if (parsed.text) {
      await appendHistory(runtime.paths.history, {
        id: `manager-${Date.now()}`,
        role: 'manager',
        text: parsed.text,
        createdAt: nowIso(),
        elapsedMs: result.elapsedMs,
        ...(result.usage ? { usage: result.usage } : {}),
      })
    }
    await appendLog(runtime.paths.log, {
      event: 'manager_end',
      status: 'ok',
      elapsedMs: result.elapsedMs,
      ...(result.usage ? { usage: result.usage } : {}),
      ...(result.fallbackUsed ? { fallbackUsed: true } : {}),
    })
    clearManagerBuffer(buffer)
    syncManagerPendingInputs(runtime, buffer)
  } catch (error) {
    const remainingInputs = buffer.inputs.slice(consumedInputCount)
    if (remainingInputs.length > 0)
      runtime.pendingInputs.unshift(...remainingInputs)
    await bestEffort('appendLog: manager_end', () =>
      appendLog(runtime.paths.log, {
        event: 'manager_end',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Math.max(0, Date.now() - startedAt),
        ...(consumedInputCount > 0 ? { consumedInputCount } : {}),
        ...(consumedResultCount > 0 ? { consumedResultCount } : {}),
      }),
    )
    await bestEffort('appendEvolveFeedback: manager_error', () =>
      appendRuntimeSignalFeedback({
        stateDir: runtime.config.stateDir,
        severity: 'high',
        message: `manager error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        extractedIssue: {
          kind: 'issue',
          issue: {
            title: `manager error: ${
              error instanceof Error ? error.message : String(error)
            }`,
            category: 'failure',
            confidence: 0.95,
            roiScore: 90,
            action: 'fix',
            rationale: 'manager runtime failure',
            fingerprint: 'manager_error',
          },
        },
        evidence: {
          event: 'manager_error',
        },
        context: {
          note: 'manager_error',
        },
      }).then(() => undefined),
    )
    await appendFallbackReply(runtime.paths)
    clearManagerBuffer(buffer)
    syncManagerPendingInputs(runtime, buffer)
  } finally {
    await bestEffort('persistRuntimeState: manager', () =>
      persistRuntimeState(runtime),
    )
    runtime.managerRunning = false
  }
}
