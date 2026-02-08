import type { AppConfig } from './config.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

const parseEnvBoolean = (
  name: string,
  value: string | undefined,
): boolean | undefined => {
  if (!value) return undefined
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  console.warn(`[cli] invalid ${name}:`, value)
  return undefined
}

const parseEnvPositiveInteger = (
  name: string,
  value: string | undefined,
): number | undefined => {
  if (!value) return undefined
  const parsed = Number(value)
  if (Number.isInteger(parsed) && parsed > 0) return parsed
  console.warn(`[cli] invalid ${name}:`, value)
  return undefined
}

const parseEnvNonNegativeNumber = (
  name: string,
  value: string | undefined,
): number | undefined => {
  if (!value) return undefined
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed >= 0) return parsed
  console.warn(`[cli] invalid ${name}:`, value)
  return undefined
}

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

const applyReasoningEnv = (config: AppConfig): void => {
  const envReasoning = process.env.MIMIKIT_REASONING_EFFORT?.trim()
  const envTellerReasoning = process.env.MIMIKIT_TELLER_REASONING_EFFORT?.trim()
  const envThinkerReasoning =
    process.env.MIMIKIT_THINKER_REASONING_EFFORT?.trim()
  const envStandardReasoning =
    process.env.MIMIKIT_WORKER_STANDARD_REASONING_EFFORT?.trim()
  const envWorkerReasoning = process.env.MIMIKIT_WORKER_REASONING_EFFORT?.trim()
  const envWorkerExpertReasoning =
    process.env.MIMIKIT_WORKER_EXPERT_REASONING_EFFORT?.trim()
  if (
    !envReasoning &&
    !envTellerReasoning &&
    !envThinkerReasoning &&
    !envStandardReasoning &&
    !envWorkerReasoning &&
    !envWorkerExpertReasoning
  )
    return
  const allowed: ModelReasoningEffort[] = [
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
  ]
  if (envReasoning) {
    if (allowed.includes(envReasoning as ModelReasoningEffort)) {
      config.teller.modelReasoningEffort = envReasoning as ModelReasoningEffort
      config.thinker.modelReasoningEffort = envReasoning as ModelReasoningEffort
      config.worker.standard.modelReasoningEffort =
        envReasoning as ModelReasoningEffort
      config.worker.expert.modelReasoningEffort =
        envReasoning as ModelReasoningEffort
    } else console.warn('[cli] invalid MIMIKIT_REASONING_EFFORT:', envReasoning)
  }
  if (envTellerReasoning) {
    if (allowed.includes(envTellerReasoning as ModelReasoningEffort)) {
      config.teller.modelReasoningEffort =
        envTellerReasoning as ModelReasoningEffort
    } else {
      console.warn(
        '[cli] invalid MIMIKIT_TELLER_REASONING_EFFORT:',
        envTellerReasoning,
      )
    }
  }
  if (envThinkerReasoning) {
    if (allowed.includes(envThinkerReasoning as ModelReasoningEffort)) {
      config.thinker.modelReasoningEffort =
        envThinkerReasoning as ModelReasoningEffort
    } else {
      console.warn(
        '[cli] invalid MIMIKIT_THINKER_REASONING_EFFORT:',
        envThinkerReasoning,
      )
    }
  }
  if (envStandardReasoning) {
    if (allowed.includes(envStandardReasoning as ModelReasoningEffort)) {
      config.worker.standard.modelReasoningEffort =
        envStandardReasoning as ModelReasoningEffort
    } else {
      console.warn(
        '[cli] invalid MIMIKIT_WORKER_STANDARD_REASONING_EFFORT:',
        envStandardReasoning,
      )
    }
  }
  if (envWorkerReasoning) {
    if (allowed.includes(envWorkerReasoning as ModelReasoningEffort)) {
      config.worker.expert.modelReasoningEffort =
        envWorkerReasoning as ModelReasoningEffort
    } else {
      console.warn(
        '[cli] invalid MIMIKIT_WORKER_REASONING_EFFORT:',
        envWorkerReasoning,
      )
    }
  }
  if (envWorkerExpertReasoning) {
    if (allowed.includes(envWorkerExpertReasoning as ModelReasoningEffort)) {
      config.worker.expert.modelReasoningEffort =
        envWorkerExpertReasoning as ModelReasoningEffort
      return
    }
    console.warn(
      '[cli] invalid MIMIKIT_WORKER_EXPERT_REASONING_EFFORT:',
      envWorkerExpertReasoning,
    )
  }
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
