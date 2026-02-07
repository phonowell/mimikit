import {
  getFeedbackReplaySuitePath,
  readEvolveFeedback,
  readEvolveFeedbackState,
  selectPendingFeedback,
  writeEvolveFeedbackState,
  writeFeedbackReplaySuite,
} from '../evolve/feedback.js'
import { buildPromotionPolicy } from '../evolve/loop-stop.js'
import { runSelfEvolveMultiRound } from '../evolve/multi-round.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { nowIso, sleep } from '../shared/utils.js'

import type { RuntimeState } from './runtime.js'

const isIdle = (runtime: RuntimeState): boolean => {
  if (runtime.managerRunning) return false
  if (runtime.pendingInputs.length > 0) return false
  if (runtime.pendingResults.length > 0) return false
  if (runtime.runningWorkers.size > 0) return false
  return true
}

const runIdleEvolveOnce = async (runtime: RuntimeState): Promise<void> => {
  const feedback = await readEvolveFeedback(runtime.config.stateDir)
  const state = await readEvolveFeedbackState(runtime.config.stateDir)
  const pending = selectPendingFeedback({
    feedback,
    processedCount: state.processedCount,
    historyLimit: runtime.config.evolve.feedbackHistoryLimit,
  })
  if (pending.length === 0) return

  const suite = await writeFeedbackReplaySuite({
    stateDir: runtime.config.stateDir,
    feedback: pending,
    maxCases: runtime.config.evolve.feedbackSuiteMaxCases,
  })
  if (!suite) return
  const suitePath = getFeedbackReplaySuitePath(runtime.config.stateDir)

  runtime.evolveRunning = true
  const startedAt = Date.now()
  try {
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
    let result = await runSelfEvolveMultiRound({
      suites,
      outDir: `${outDirRoot}/round-1`,
      stateDir: runtime.config.stateDir,
      workDir: runtime.config.workDir,
      promptPath: `${runtime.config.workDir}/prompts/agents/manager/system.md`,
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
        promptPath: `${runtime.config.workDir}/prompts/agents/manager/system.md`,
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
        promote: result.promote,
        reason: result.reason,
        elapsedMs: Math.max(0, Date.now() - startedAt),
        feedbackCount: feedback.length,
        pendingFeedbackCount: pending.length,
        maxRounds: rounds,
        baseline: result.baseline,
        candidate: result.candidate,
      }),
    )
  } finally {
    runtime.evolveRunning = false
  }
}

export const idleEvolveLoop = async (runtime: RuntimeState): Promise<void> => {
  if (!runtime.config.evolve.enabled) return
  while (!runtime.stopped) {
    try {
      if (isIdle(runtime) && !runtime.evolveRunning)
        await runIdleEvolveOnce(runtime)
    } catch (error) {
      await bestEffort('appendLog: evolve_idle_error', () =>
        appendLog(runtime.paths.log, {
          event: 'evolve_idle_error',
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
    await sleep(runtime.config.evolve.idlePollMs)
  }
}
