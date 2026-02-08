import {
  parseEnvBoolean,
  parseEnvNonNegativeNumber,
  parseEnvPositiveInteger,
} from './cli-env-parse.js'
import { applyReasoningEnv } from './cli-env-reasoning.js'

import type { AppConfig } from './config.js'

const applyModelEnv = (config: AppConfig): void => {
  const envModel = process.env.MIMIKIT_MODEL?.trim()
  if (envModel) {
    config.teller.model = envModel
    config.thinker.model = envModel
    config.worker.standard.model = envModel
  }
  const envTellerModel = process.env.MIMIKIT_TELLER_MODEL?.trim()
  if (envTellerModel) config.teller.model = envTellerModel
  const envThinkerModel = process.env.MIMIKIT_THINKER_MODEL?.trim()
  if (envThinkerModel) config.thinker.model = envThinkerModel
  const envWorkerModel = process.env.MIMIKIT_WORKER_MODEL?.trim()
  if (envWorkerModel) config.worker.expert.model = envWorkerModel
  const envWorkerStandardModel =
    process.env.MIMIKIT_WORKER_STANDARD_MODEL?.trim()
  if (envWorkerStandardModel)
    config.worker.standard.model = envWorkerStandardModel
  const envWorkerExpertModel = process.env.MIMIKIT_WORKER_EXPERT_MODEL?.trim()
  if (envWorkerExpertModel) config.worker.expert.model = envWorkerExpertModel
}

const applyEvolveEnv = (config: AppConfig): void => {
  const autoRestart = parseEnvBoolean(
    'MIMIKIT_EVOLVE_AUTO_RESTART_ON_PROMOTE',
    process.env.MIMIKIT_EVOLVE_AUTO_RESTART_ON_PROMOTE?.trim(),
  )
  if (autoRestart !== undefined) {
    console.warn(
      '[cli] MIMIKIT_EVOLVE_AUTO_RESTART_ON_PROMOTE is deprecated and ignored',
    )
  }
  const evolveMaxRounds = parseEnvPositiveInteger(
    'MIMIKIT_EVOLVE_MAX_ROUNDS',
    process.env.MIMIKIT_EVOLVE_MAX_ROUNDS?.trim(),
  )
  if (evolveMaxRounds !== undefined)
    console.warn('[cli] MIMIKIT_EVOLVE_MAX_ROUNDS is deprecated and ignored')
  const minPassRateDelta = parseEnvNonNegativeNumber(
    'MIMIKIT_EVOLVE_MIN_PASS_RATE_DELTA',
    process.env.MIMIKIT_EVOLVE_MIN_PASS_RATE_DELTA?.trim(),
  )
  if (minPassRateDelta !== undefined) {
    console.warn(
      '[cli] MIMIKIT_EVOLVE_MIN_PASS_RATE_DELTA is deprecated and ignored',
    )
  }
  const minTokenDelta = parseEnvNonNegativeNumber(
    'MIMIKIT_EVOLVE_MIN_TOKEN_DELTA',
    process.env.MIMIKIT_EVOLVE_MIN_TOKEN_DELTA?.trim(),
  )
  if (minTokenDelta !== undefined) {
    console.warn(
      '[cli] MIMIKIT_EVOLVE_MIN_TOKEN_DELTA is deprecated and ignored',
    )
  }
  const minLatencyDeltaMs = parseEnvNonNegativeNumber(
    'MIMIKIT_EVOLVE_MIN_LATENCY_DELTA_MS',
    process.env.MIMIKIT_EVOLVE_MIN_LATENCY_DELTA_MS?.trim(),
  )
  if (minLatencyDeltaMs !== undefined) {
    console.warn(
      '[cli] MIMIKIT_EVOLVE_MIN_LATENCY_DELTA_MS is deprecated and ignored',
    )
  }
  const feedbackSuiteMaxCases = parseEnvPositiveInteger(
    'MIMIKIT_EVOLVE_FEEDBACK_SUITE_MAX_CASES',
    process.env.MIMIKIT_EVOLVE_FEEDBACK_SUITE_MAX_CASES?.trim(),
  )
  if (feedbackSuiteMaxCases !== undefined) {
    console.warn(
      '[cli] MIMIKIT_EVOLVE_FEEDBACK_SUITE_MAX_CASES is deprecated and ignored',
    )
  }
  const idleReviewEnabled = parseEnvBoolean(
    'MIMIKIT_EVOLVE_IDLE_REVIEW_ENABLED',
    process.env.MIMIKIT_EVOLVE_IDLE_REVIEW_ENABLED?.trim(),
  )
  if (idleReviewEnabled !== undefined)
    config.evolve.idleReviewEnabled = idleReviewEnabled
  const idleReviewIntervalMs = parseEnvPositiveInteger(
    'MIMIKIT_EVOLVE_IDLE_REVIEW_INTERVAL_MS',
    process.env.MIMIKIT_EVOLVE_IDLE_REVIEW_INTERVAL_MS?.trim(),
  )
  if (idleReviewIntervalMs !== undefined)
    config.evolve.idleReviewIntervalMs = idleReviewIntervalMs
  const idleReviewHistoryCount = parseEnvPositiveInteger(
    'MIMIKIT_EVOLVE_IDLE_REVIEW_HISTORY_COUNT',
    process.env.MIMIKIT_EVOLVE_IDLE_REVIEW_HISTORY_COUNT?.trim(),
  )
  if (idleReviewHistoryCount !== undefined)
    config.evolve.idleReviewHistoryCount = idleReviewHistoryCount
  const runtimeHighLatencyMs = parseEnvPositiveInteger(
    'MIMIKIT_EVOLVE_RUNTIME_HIGH_LATENCY_MS',
    process.env.MIMIKIT_EVOLVE_RUNTIME_HIGH_LATENCY_MS?.trim(),
  )
  if (runtimeHighLatencyMs !== undefined)
    config.evolve.runtimeHighLatencyMs = runtimeHighLatencyMs
  const runtimeHighUsage = parseEnvPositiveInteger(
    'MIMIKIT_EVOLVE_RUNTIME_HIGH_USAGE_TOTAL',
    process.env.MIMIKIT_EVOLVE_RUNTIME_HIGH_USAGE_TOTAL?.trim(),
  )
  if (runtimeHighUsage !== undefined)
    config.evolve.runtimeHighUsageTotal = runtimeHighUsage
}

export const applyCliEnvOverrides = (config: AppConfig): void => {
  applyModelEnv(config)
  applyReasoningEnv(config)
  applyEvolveEnv(config)
}
