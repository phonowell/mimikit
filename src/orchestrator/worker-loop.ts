import { appendStructuredFeedback } from '../evolve/feedback.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { nowIso, sleep } from '../shared/utils.js'
import { markTaskRunning, pickNextPendingTask } from '../tasks/queue.js'

import { runIdleConversationReview } from './idle-review.js'
import { persistRuntimeState } from './runtime-persist.js'
import { appendRuntimeIssue } from './worker-feedback.js'
import { runTask } from './worker-run-task.js'

import type { RuntimeState } from './runtime-state.js'
import type { Task } from '../types/index.js'

const isRuntimeIdle = (runtime: RuntimeState): boolean => {
  if (runtime.thinkerRunning) return false
  if (runtime.inflightInputs.length > 0) return false
  return !runtime.tasks.some(
    (task) => task.status === 'pending' || task.status === 'running',
  )
}

const spawnWorker = async (runtime: RuntimeState, task: Task) => {
  if (task.status !== 'pending') return
  if (runtime.runningWorkers.has(task.id)) return
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
      if (
        runtime.config.evolve.idleReviewEnabled &&
        isRuntimeIdle(runtime) &&
        (!runtime.evolveState.lastIdleReviewAt ||
          Date.now() - Date.parse(runtime.evolveState.lastIdleReviewAt) >=
            runtime.config.evolve.idleReviewIntervalMs)
      ) {
        await runIdleConversationReview({
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
