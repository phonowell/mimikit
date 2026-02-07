import { runCodeEvolveRound } from '../evolve/code-evolve.js'
import {
  appendRuntimeSignalFeedback,
  getFeedbackReplaySuitePath,
  hasPendingEvolveFeedback,
  readEvolveFeedback,
  readEvolveFeedbackState,
  selectPendingFeedback,
  writeEvolveFeedbackState,
  writeFeedbackReplaySuite,
} from '../evolve/feedback.js'
import { buildPromotionPolicy } from '../evolve/loop-stop.js'
import { runSelfEvolveMultiRound } from '../evolve/multi-round.js'
import { appendLog } from '../log/append.js'
import { bestEffort, safeOrUndefined } from '../log/safe.js'
import { runWorker } from '../roles/worker-runner.js'
import { nowIso, sleep } from '../shared/utils.js'
import { appendTaskResultArchive } from '../storage/task-results.js'
import {
  enqueueSystemEvolveTask,
  markTaskCanceled,
  markTaskFailed,
  markTaskRunning,
  markTaskSucceeded,
  pickNextPendingTask,
} from '../tasks/queue.js'

import { persistRuntimeState } from './runtime-persist.js'
import {
  addTokenUsage,
  canSpendTokens,
  isTokenBudgetExceeded,
} from './token-budget.js'

import type { RuntimeState } from './runtime.js'
import type { Task, TaskResult, TokenUsage } from '../types/index.js'

const estimateTaskTokenCost = (task: Task): number =>
  Math.max(1024, Math.ceil(task.prompt.length / 2))

const buildResult = (
  task: Task,
  status: TaskResult['status'],
  output: string,
  durationMs: number,
  usage?: TokenUsage,
): TaskResult => ({
  taskId: task.id,
  status,
  ok: status === 'succeeded',
  output,
  durationMs,
  completedAt: nowIso(),
  ...(usage ? { usage } : {}),
  ...(task.title ? { title: task.title } : {}),
})

const archiveResult = (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
): Promise<string | undefined> =>
  safeOrUndefined('appendTaskResultArchive: worker', () =>
    appendTaskResultArchive(runtime.config.stateDir, {
      taskId: task.id,
      title: task.title,
      status: result.status,
      prompt: task.prompt,
      output: result.output,
      createdAt: task.createdAt,
      completedAt: result.completedAt,
      durationMs: result.durationMs,
      ...(result.usage ? { usage: result.usage } : {}),
    }),
  )

const finalizeResult = async (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
  markFn: (tasks: Task[], taskId: string, patch?: Partial<Task>) => void,
) => {
  const archivePath = await archiveResult(runtime, task, result)
  if (archivePath) result.archivePath = archivePath
  markFn(runtime.tasks, task.id, {
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    ...(result.usage ? { usage: result.usage } : {}),
    ...(archivePath ? { archivePath } : {}),
  })
  if (task.kind !== 'system_evolve') runtime.pendingResults.push(result)
  await bestEffort('appendLog: worker_end', () =>
    appendLog(runtime.paths.log, {
      event: 'worker_end',
      taskId: task.id,
      status: result.status,
      durationMs: result.durationMs,
      elapsedMs: result.durationMs,
      ...(result.usage ? { usage: result.usage } : {}),
      ...(archivePath ? { archivePath } : {}),
    }),
  )
}

const isRuntimeIdleForEvolve = (runtime: RuntimeState): boolean => {
  if (runtime.managerRunning) return false
  if (runtime.pendingInputs.length > 0) return false
  if (runtime.pendingResults.length > 0) return false
  const hasRunningUserTask = runtime.tasks.some(
    (task) => task.status === 'running' && task.kind !== 'system_evolve',
  )
  if (hasRunningUserTask) return false
  const hasPendingUserTask = runtime.tasks.some(
    (task) => task.status === 'pending' && task.kind !== 'system_evolve',
  )
  return !hasPendingUserTask
}

const hasPendingEvolveTask = (runtime: RuntimeState): boolean =>
  runtime.tasks.some(
    (task) =>
      task.kind === 'system_evolve' &&
      (task.status === 'pending' || task.status === 'running'),
  )

const runSystemEvolveTask = async (
  runtime: RuntimeState,
  task: Task,
): Promise<{ output: string; usage?: TokenUsage }> => {
  const promptPathRelative = 'prompts/agents/manager/system.md'
  const promptPathAbsolute = `${runtime.config.workDir}/${promptPathRelative}`
  const feedbackStateBefore = await readEvolveFeedbackState(
    runtime.config.stateDir,
  )
  const feedbackBefore = await readEvolveFeedback(runtime.config.stateDir)
  const promptRollback = {
    required: false,
    original: '' as string,
  }
  const rollbackPromptIfNeeded = async (): Promise<void> => {
    if (!promptRollback.required) return
    const { restorePrompt } = await import('../evolve/prompt-optimizer.js')
    await restorePrompt(promptPathAbsolute, promptRollback.original)
  }
  try {
    const feedback = feedbackBefore
    const state = feedbackStateBefore
    const pending = selectPendingFeedback({
      feedback,
      processedCount: state.processedCount,
      historyLimit: runtime.config.evolve.feedbackHistoryLimit,
    })
    if (pending.length === 0) {
      return {
        output: 'evolve skipped: no pending feedback',
        usage: { total: 0, input: 0, output: 0 },
      }
    }

    const suite = await writeFeedbackReplaySuite({
      stateDir: runtime.config.stateDir,
      feedback: pending,
      maxCases: runtime.config.evolve.feedbackSuiteMaxCases,
    })
    if (!suite) {
      return {
        output: 'evolve skipped: no derived replay suite',
        usage: { total: 0, input: 0, output: 0 },
      }
    }
    const suitePath = getFeedbackReplaySuitePath(runtime.config.stateDir)
    const outDirRoot = `${runtime.config.stateDir}/evolve/idle-run-${Date.now()}`
    const rounds = Math.max(1, runtime.config.evolve.maxRounds)
    const suites = [{ path: suitePath, alias: 'feedback', weight: 1 }]
    const promotionPolicy = buildPromotionPolicy({
      minPassRateDelta: runtime.config.evolve.minPassRateDelta,
      minTokenDelta: runtime.config.evolve.minTokenDelta,
      minLatencyDeltaMs: runtime.config.evolve.minLatencyDeltaMs,
    })
    const modelOptions = {
      ...(runtime.config.manager.model
        ? { model: runtime.config.manager.model }
        : {}),
      ...(runtime.config.manager.model
        ? { optimizerModel: runtime.config.manager.model }
        : {}),
    }

    const promptOriginal = await import('node:fs/promises').then(
      ({ readFile }) => readFile(promptPathAbsolute, 'utf8'),
    )

    let result = await runSelfEvolveMultiRound({
      suites,
      outDir: `${outDirRoot}/round-1`,
      stateDir: runtime.config.stateDir,
      workDir: runtime.config.workDir,
      promptPath: promptPathAbsolute,
      timeoutMs: runtime.config.worker.timeoutMs,
      promotionPolicy,
      ...modelOptions,
    })
    for (let index = 1; index < rounds; index += 1) {
      if (!result.promote) break
      result = await runSelfEvolveMultiRound({
        suites,
        outDir: `${outDirRoot}/round-${index + 1}`,
        stateDir: runtime.config.stateDir,
        workDir: runtime.config.workDir,
        promptPath: promptPathAbsolute,
        timeoutMs: runtime.config.worker.timeoutMs,
        promotionPolicy,
        ...modelOptions,
      })
    }

    await writeEvolveFeedbackState(runtime.config.stateDir, {
      processedCount: feedback.length,
      lastRunAt: nowIso(),
    })
    await bestEffort('appendLog: evolve_idle_run', () =>
      appendLog(runtime.paths.log, {
        event: 'evolve_idle_run',
        taskId: task.id,
        promote: result.promote,
        reason: result.reason,
        feedbackCount: feedback.length,
        pendingFeedbackCount: pending.length,
        maxRounds: rounds,
        baseline: result.baseline,
        candidate: result.candidate,
      }),
    )

    const shouldRunCodeEvolve = pending.some(
      (item) => item.context?.note === 'code_evolve_required',
    )
    let codeEvolveUsage: TokenUsage | undefined
    let codeResultValidationOk = true
    if (result.promote && shouldRunCodeEvolve) {
      promptRollback.required = true
      promptRollback.original = promptOriginal
      const messages = pending.map((item) => item.message)
      const codeResult = await runCodeEvolveRound({
        stateDir: runtime.config.stateDir,
        workDir: runtime.config.workDir,
        timeoutMs: runtime.config.worker.timeoutMs,
        ...(runtime.config.worker.model
          ? { model: runtime.config.worker.model }
          : {}),
        feedbackMessages: messages,
        allowDirtyPaths: [
          promptPathRelative,
          promptPathRelative.replaceAll('/', '\\'),
        ],
      })
      codeEvolveUsage = codeResult.usage
      codeResultValidationOk = codeResult.validation.ok
      if (!codeResult.validation.ok) {
        await rollbackPromptIfNeeded()
        await writeEvolveFeedbackState(
          runtime.config.stateDir,
          feedbackStateBefore,
        )
      }
      await bestEffort('appendLog: evolve_code_run', () =>
        appendLog(runtime.paths.log, {
          event: 'evolve_code_run',
          taskId: task.id,
          applied: codeResult.applied,
          reason: codeResult.reason,
          llmElapsedMs: codeResult.llmElapsedMs,
          changedFiles: codeResult.changedFiles,
          validation: codeResult.validation,
          ...(codeResult.usage ? { usage: codeResult.usage } : {}),
        }),
      )
    }

    if (
      result.promote &&
      codeResultValidationOk &&
      runtime.config.evolve.autoRestartOnPromote
    ) {
      runtime.postRestartHealthGate = {
        required: true,
        promptPath: promptPathAbsolute,
        promptBackup: promptOriginal,
        suitePath,
      }
      await bestEffort('persistRuntimeState: evolve_restart', () =>
        persistRuntimeState(runtime),
      )
      setTimeout(() => {
        process.exit(75)
      }, 100)
    }

    const baseUsageTotal = Math.max(
      0,
      Math.round(
        result.baseline.weightedUsageTotal +
          result.candidate.weightedUsageTotal,
      ),
    )
    const usageTotal = baseUsageTotal + (codeEvolveUsage?.total ?? 0)
    const output = `evolve ${result.promote ? 'promoted' : 'rolled_back'}: ${result.reason}`
    return {
      output,
      usage: {
        total: usageTotal,
        input: baseUsageTotal + (codeEvolveUsage?.input ?? 0),
        output: codeEvolveUsage?.output ?? 0,
      },
    }
  } catch (error) {
    await bestEffort('rollbackPromptIfNeeded: evolve_idle_error', () =>
      rollbackPromptIfNeeded(),
    )
    await bestEffort('restoreFeedbackState: evolve_idle_error', () =>
      writeEvolveFeedbackState(runtime.config.stateDir, feedbackStateBefore),
    )
    await bestEffort('appendEvolveFeedback: evolve_idle_error', () =>
      appendRuntimeSignalFeedback({
        stateDir: runtime.config.stateDir,
        severity: 'high',
        message: `evolve idle error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        context: {
          note: 'evolve_idle_error',
        },
      }).then(() => undefined),
    )
    await bestEffort('appendLog: evolve_idle_error', () =>
      appendLog(runtime.paths.log, {
        event: 'evolve_idle_error',
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    throw error
  }
}

const runTask = async (
  runtime: RuntimeState,
  task: Task,
  controller: AbortController,
): Promise<void> => {
  const startedAt = Date.now()
  const elapsed = () => Math.max(0, Date.now() - startedAt)
  try {
    await appendLog(runtime.paths.log, {
      event: 'worker_start',
      taskId: task.id,
      promptChars: task.prompt.length,
    })
    let llmResult: Awaited<ReturnType<typeof runWorker>> | null = null
    if (task.kind === 'system_evolve') {
      const result = await runSystemEvolveTask(runtime, task)
      addTokenUsage(runtime, result.usage?.total)
      const taskResult = buildResult(
        task,
        'succeeded',
        result.output,
        elapsed(),
        result.usage,
      )
      await finalizeResult(runtime, task, taskResult, markTaskSucceeded)
      return
    }
    const maxAttempts = Math.max(0, runtime.config.worker.retryMaxAttempts)
    const backoffMs = Math.max(0, runtime.config.worker.retryBackoffMs)
    let attempt = 0
    while (attempt <= maxAttempts) {
      try {
        llmResult = await runWorker({
          stateDir: runtime.config.stateDir,
          workDir: runtime.config.workDir,
          task,
          timeoutMs: runtime.config.worker.timeoutMs,
          ...(runtime.config.worker.model
            ? { model: runtime.config.worker.model }
            : {}),
          abortSignal: controller.signal,
        })
        break
      } catch (error) {
        await bestEffort('appendEvolveFeedback: worker_retry', () =>
          appendRuntimeSignalFeedback({
            stateDir: runtime.config.stateDir,
            severity: 'medium',
            message: `worker retry: ${
              error instanceof Error ? error.message : String(error)
            }`,
            context: {
              note: 'worker_retry',
            },
          }).then(() => undefined),
        )
        if (attempt >= maxAttempts) throw error
        await appendLog(runtime.paths.log, {
          event: 'worker_retry',
          taskId: task.id,
          attempt: attempt + 1,
          maxAttempts,
          backoffMs,
        })
        attempt += 1
        task.attempts = Math.max(0, (task.attempts ?? 0) + 1)
        await bestEffort('persistRuntimeState: worker_retry', () =>
          persistRuntimeState(runtime),
        )
        await sleep(backoffMs)
      }
    }
    if (!llmResult) throw new Error('worker_result_missing')
    addTokenUsage(runtime, llmResult.usage?.total)
    if (task.status === 'canceled') {
      const result = buildResult(
        task,
        'canceled',
        'Task canceled',
        elapsed(),
        llmResult.usage,
      )
      await finalizeResult(runtime, task, result, markTaskCanceled)
      return
    }
    const result = buildResult(
      task,
      'succeeded',
      llmResult.output,
      elapsed(),
      llmResult.usage,
    )
    await finalizeResult(runtime, task, result, markTaskSucceeded)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    if (task.status === 'canceled') {
      const result = buildResult(
        task,
        'canceled',
        err.message || 'Task canceled',
        elapsed(),
      )
      await finalizeResult(runtime, task, result, markTaskCanceled)
      return
    }
    const result = buildResult(task, 'failed', err.message, elapsed())
    await bestEffort('appendEvolveFeedback: worker_failed', () =>
      appendRuntimeSignalFeedback({
        stateDir: runtime.config.stateDir,
        severity: 'high',
        message: `worker failed: ${err.message}`,
        context: {
          note: 'worker_failed',
          input: task.prompt,
        },
      }).then(() => undefined),
    )
    await finalizeResult(runtime, task, result, markTaskFailed)
  }
}

const spawnWorker = async (runtime: RuntimeState, task: Task) => {
  if (task.status !== 'pending') return
  if (runtime.runningWorkers.has(task.id)) return
  if (task.kind === 'system_evolve' && !isRuntimeIdleForEvolve(runtime)) return

  if (!canSpendTokens(runtime, estimateTaskTokenCost(task))) {
    await bestEffort('appendEvolveFeedback: worker_budget_skipped', () =>
      appendRuntimeSignalFeedback({
        stateDir: runtime.config.stateDir,
        severity: 'medium',
        message: 'worker budget skipped: task deferred due to token budget',
        context: {
          note: 'worker_budget_skipped',
          input: task.prompt,
        },
      }).then(() => undefined),
    )
    await bestEffort('appendLog: worker_budget_skipped', () =>
      appendLog(runtime.paths.log, {
        event: 'worker_budget_skipped',
        taskId: task.id,
        budgetDate: runtime.tokenBudget.date,
        budgetSpent: runtime.tokenBudget.spent,
        budgetLimit: runtime.config.tokenBudget.dailyTotal,
      }),
    )
    return
  }
  runtime.runningWorkers.add(task.id)
  const controller = new AbortController()
  runtime.runningControllers.set(task.id, controller)
  markTaskRunning(runtime.tasks, task.id)
  await bestEffort('persistRuntimeState: worker_start', () =>
    persistRuntimeState(runtime),
  )
  try {
    await runTask(runtime, task, controller)
  } finally {
    runtime.runningWorkers.delete(task.id)
    runtime.runningControllers.delete(task.id)
    await bestEffort('persistRuntimeState: worker_end', () =>
      persistRuntimeState(runtime),
    )
  }
}

export const workerLoop = async (runtime: RuntimeState): Promise<void> => {
  const evolvePollMs = Math.max(1000, runtime.config.evolve.idlePollMs)
  let nextEvolvePollAt = 0
  while (!runtime.stopped) {
    try {
      if (isTokenBudgetExceeded(runtime)) {
        await sleep(1000)
        continue
      }
      const canProbeEvolve =
        runtime.config.evolve.enabled &&
        isRuntimeIdleForEvolve(runtime) &&
        !hasPendingEvolveTask(runtime)
      if (canProbeEvolve) {
        const now = Date.now()
        if (now >= nextEvolvePollAt) {
          nextEvolvePollAt = now + evolvePollMs
          const hasPendingFeedback = await hasPendingEvolveFeedback({
            stateDir: runtime.config.stateDir,
            historyLimit: runtime.config.evolve.feedbackHistoryLimit,
          })
          if (hasPendingFeedback) {
            enqueueSystemEvolveTask(runtime.tasks)
            nextEvolvePollAt = 0
          }
        }
      } else nextEvolvePollAt = 0

      if (runtime.runningWorkers.size < runtime.config.worker.maxConcurrent) {
        const next = pickNextPendingTask(runtime.tasks, runtime.runningWorkers)
        if (next) void spawnWorker(runtime, next)
      }
    } catch (error) {
      await bestEffort('appendEvolveFeedback: worker_loop_error', () =>
        appendRuntimeSignalFeedback({
          stateDir: runtime.config.stateDir,
          severity: 'high',
          message: `worker loop error: ${
            error instanceof Error ? error.message : String(error)
          }`,
          context: {
            note: 'worker_loop_error',
          },
        }).then(() => undefined),
      )
      await bestEffort('appendLog: worker_loop_error', () =>
        appendLog(runtime.paths.log, {
          event: 'worker_loop_error',
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
    await sleep(1000)
  }
}
