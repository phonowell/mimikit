import {
  appendStructuredFeedback,
} from '../evolve/feedback.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { nowIso, sleep } from '../shared/utils.js'
import {
  markTaskRunning,
  pickNextPendingTask,
} from '../tasks/queue.js'

import { runIdleConversationReview } from './idle-review.js'
import { persistRuntimeState } from './runtime-persist.js'
import {
  addTokenUsage,
  canSpendTokens,
  isTokenBudgetExceeded,
} from './token-budget.js'
import { appendRuntimeIssue } from './worker-feedback.js'
import { runTask } from './worker-run-task.js'

import type { RuntimeState } from './runtime.js'
import type { Task } from '../types/index.js'

const estimateTaskTokenCost = (task: Task): number =>
  Math.max(1024, Math.ceil(task.prompt.length / 2))

const isRuntimeIdle = (runtime: RuntimeState): boolean => {
  if (runtime.managerRunning) return false
  if (runtime.pendingInputs.length > 0) return false
  if (runtime.pendingResults.length > 0) return false
  return !runtime.tasks.some(
    (task) => task.status === 'pending' || task.status === 'running',
  )
}

const spawnWorker = async (runtime: RuntimeState, task: Task) => {
  if (task.status !== 'pending') return
  if (runtime.runningWorkers.has(task.id)) return
  if (!canSpendTokens(runtime, estimateTaskTokenCost(task))) {
    await bestEffort('appendEvolveFeedback: worker_budget_skipped', () =>
      appendRuntimeIssue({
        runtime,
        severity: 'medium',
        category: 'cost',
        message: 'worker budget skipped: task deferred due to token budget',
        note: 'worker_budget_skipped',
        task,
        confidence: 0.9,
        roiScore: 72,
        action: 'fix',
      }),
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
  while (!runtime.stopped) {
    try {
      if (isTokenBudgetExceeded(runtime)) {
        await sleep(1000)
        continue
      }
      if (
        runtime.config.evolve.idleReviewEnabled &&
        isRuntimeIdle(runtime) &&
        (!runtime.evolveState.lastIdleReviewAt ||
          Date.now() - Date.parse(runtime.evolveState.lastIdleReviewAt) >=
            runtime.config.evolve.idleReviewIntervalMs)
      ) {
        const idleReview = await runIdleConversationReview({
          runtime,
          appendFeedback: async ({ message, extractedIssue }) => {
            await appendStructuredFeedback({
              stateDir: runtime.config.stateDir,
              feedback: {
                id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                createdAt: nowIso(),
                kind: 'user_feedback',
                severity: 'medium',
                message,
                source: 'idle_review',
                context: { note: 'idle_review' },
              },
              extractedIssue,
            })
          },
        })
        runtime.evolveState.lastIdleReviewAt = nowIso()
        await persistRuntimeState(runtime)
        addTokenUsage(runtime, idleReview.usageTotal)
      }

      if (runtime.runningWorkers.size < runtime.config.worker.maxConcurrent) {
        const next = pickNextPendingTask(runtime.tasks, runtime.runningWorkers)
        if (next) void spawnWorker(runtime, next)
      }
    } catch (error) {
      await bestEffort('appendEvolveFeedback: worker_loop_error', () =>
        appendRuntimeIssue({
          runtime,
          severity: 'high',
          category: 'failure',
          message: `worker loop error: ${
            error instanceof Error ? error.message : String(error)
          }`,
          note: 'worker_loop_error',
          confidence: 0.95,
          roiScore: 90,
          action: 'fix',
        }),
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
