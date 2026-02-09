import { appendStructuredFeedback } from '../evolve/feedback.js'
import { bestEffort } from '../log/safe.js'
import { nowIso } from '../shared/utils.js'

import { runIdleConversationReview } from './idle-review.js'
import { persistRuntimeState } from './runtime-persist.js'
import { appendRuntimeIssue } from './worker-feedback.js'
import { waitForWorkerLoopSignal } from './worker-signal.js'

import type { RuntimeState } from './runtime-state.js'
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
): Promise<void> => {
  const message = error instanceof Error ? error.message : String(error)
  await bestEffort('appendEvolveFeedback: worker_loop_error', () =>
    appendRuntimeIssue({
      runtime,
      severity: 'high',
      category: 'failure',
      message: `worker loop error: ${message}`,
      note: 'worker_loop_error',
      confidence: 0.95,
      roiScore: 90,
      action: 'fix',
    }),
  )
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
    } catch (error) {
      await reportWorkerLoopError(runtime, error)
    }
    await waitForWorkerLoopSignal(runtime, resolveIdleReviewWaitMs(runtime))
  }
  runtime.workerQueue.pause()
  runtime.workerQueue.clear()
}
