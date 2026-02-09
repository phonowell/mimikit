import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { waitForWorkerLoopSignal } from '../orchestrator/core/worker-signal.js'
import { generateMissingDailyReports } from '../reporting/daily-report.js'

import { appendRuntimeIssue } from './runtime-utils.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

const reportWorkerLoopError = async (
  runtime: RuntimeState,
  error: unknown,
): Promise<void> => {
  const message = error instanceof Error ? error.message : String(error)
  await bestEffort('appendReportingEvent: worker_loop_error', () =>
    appendRuntimeIssue({
      runtime,
      severity: 'high',
      category: 'failure',
      message: `worker loop error: ${message}`,
      note: 'worker_loop_error',
    }),
  )
}

const resolveWorkerLoopWaitMs = (runtime: RuntimeState): number => {
  if (!runtime.config.reporting.dailyReportEnabled)
    return Number.POSITIVE_INFINITY
  return Math.max(5_000, runtime.config.teller.pollMs)
}

const maybeGenerateDailyReports = async (
  runtime: RuntimeState,
): Promise<void> => {
  if (!runtime.config.reporting.dailyReportEnabled) return
  const result = await generateMissingDailyReports({
    stateDir: runtime.config.stateDir,
    ...(runtime.reportingState.lastDailyReportDate
      ? { lastDailyReportDate: runtime.reportingState.lastDailyReportDate }
      : {}),
  })
  if (result.generatedDates.length === 0) return
  if (result.lastDailyReportDate)
    runtime.reportingState.lastDailyReportDate = result.lastDailyReportDate
  await persistRuntimeState(runtime)
}

export const workerLoop = async (runtime: RuntimeState): Promise<void> => {
  while (!runtime.stopped) {
    try {
      await maybeGenerateDailyReports(runtime)
    } catch (error) {
      await reportWorkerLoopError(runtime, error)
    }
    await waitForWorkerLoopSignal(runtime, resolveWorkerLoopWaitMs(runtime))
  }
  runtime.workerQueue.pause()
  runtime.workerQueue.clear()
}
