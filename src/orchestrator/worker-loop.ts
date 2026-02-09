import PQueue from 'p-queue'

import { appendStructuredFeedback } from '../evolve/feedback.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { nowIso } from '../shared/utils.js'
import { markTaskRunning } from '../tasks/queue.js'

import { runIdleConversationReview } from './idle-review.js'
import { persistRuntimeState } from './runtime-persist.js'
import { appendRuntimeIssue } from './worker-feedback.js'
import { runTask } from './worker-run-task.js'
import { notifyWorkerLoop, waitForWorkerLoopSignal } from './worker-signal.js'

import type { RuntimeState } from './runtime-state.js'
import type { Task } from '../types/index.js'

const isRuntimeIdle = (runtime: RuntimeState): boolean => {
  if (runtime.thinkerRunning) return false
  if (runtime.inflightInputs.length > 0) return false
  return !runtime.tasks.some(
    (task) => task.status === 'pending' || task.status === 'running',
  )
}

const reportWorkerLoopError = async (
  runtime: RuntimeState,
  error: unknown,
  note: 'worker_loop_error' | 'worker_queue_error',
): Promise<void> => {
  const message = error instanceof Error ? error.message : String(error)
  await bestEffort(`appendEvolveFeedback: ${note}`, () =>
    appendRuntimeIssue({
      runtime,
      severity: 'high',
      category: 'failure',
      message: `worker loop error: ${message}`,
      note,
      confidence: 0.95,
      roiScore: 90,
      action: 'fix',
    }),
  )
  await bestEffort(`appendLog: ${note}`, () =>
    appendLog(runtime.paths.log, {
      event: note,
      error: message,
    }),
  )
}

const spawnWorker = async (runtime: RuntimeState, task: Task) => {
  if (task.status !== 'pending') return
  if (runtime.runningControllers.has(task.id)) return
  const controller = new AbortController()
  runtime.runningControllers.set(task.id, controller)
  markTaskRunning(runtime.tasks, task.id)
  await bestEffort('persistRuntimeState: worker_start', () =>
    persistRuntimeState(runtime),
  )
  try {
    await runTask(runtime, task, controller)
  } finally {
    runtime.runningControllers.delete(task.id)
    await bestEffort('persistRuntimeState: worker_end', () =>
      persistRuntimeState(runtime),
    )
    notifyWorkerLoop(runtime)
  }
}

const enqueuePendingWorkers = (
  runtime: RuntimeState,
  workerQueue: PQueue,
): void => {
  for (const task of runtime.tasks) {
    if (task.status !== 'pending') continue
    if (runtime.runningControllers.has(task.id)) continue
    if (workerQueue.sizeBy({ id: task.id }) > 0) continue
    void workerQueue
      .add(() => spawnWorker(runtime, task), { id: task.id })
      .catch((error) =>
        reportWorkerLoopError(runtime, error, 'worker_queue_error'),
      )
  }
}

const resolveIdleReviewWaitMs = (runtime: RuntimeState): number => {
  if (!runtime.config.evolve.idleReviewEnabled) return Number.POSITIVE_INFINITY
  const last = runtime.evolveState.lastIdleReviewAt
  if (!last) return runtime.config.teller.pollMs
  const elapsed = Date.now() - Date.parse(last)
  const remain = runtime.config.evolve.idleReviewIntervalMs - elapsed
  if (remain <= 0) return 0
  return remain
}

export const workerLoop = async (runtime: RuntimeState): Promise<void> => {
  const workerQueue = new PQueue({
    concurrency: runtime.config.worker.maxConcurrent,
  })
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
      enqueuePendingWorkers(runtime, workerQueue)
    } catch (error) {
      await reportWorkerLoopError(runtime, error, 'worker_loop_error')
    }
    await waitForWorkerLoopSignal(runtime, resolveIdleReviewWaitMs(runtime))
  }
  workerQueue.pause()
  workerQueue.clear()
}
