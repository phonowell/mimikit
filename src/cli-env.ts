import type { SupervisorConfig } from './config.js'
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

const applyModelEnv = (config: SupervisorConfig): void => {
  const envModel = process.env.MIMIKIT_MODEL?.trim()
  if (envModel) config.manager.model = envModel
  const envWorkerModel = process.env.MIMIKIT_WORKER_MODEL?.trim()
  if (envWorkerModel) config.worker.model = envWorkerModel
}

const applyReasoningEnv = (config: SupervisorConfig): void => {
  const envReasoning = process.env.MIMIKIT_REASONING_EFFORT?.trim()
  if (!envReasoning) return
  const allowed: ModelReasoningEffort[] = [
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
  ]
  if (allowed.includes(envReasoning as ModelReasoningEffort)) {
    config.manager.modelReasoningEffort = envReasoning as ModelReasoningEffort
    return
  }
  console.warn('[cli] invalid MIMIKIT_REASONING_EFFORT:', envReasoning)
}

const applyTokenBudgetEnv = (config: SupervisorConfig): void => {
  const envTokenBudgetDaily = process.env.MIMIKIT_TOKEN_BUDGET_DAILY?.trim()
  if (envTokenBudgetDaily) {
    const parsed = Number(envTokenBudgetDaily)
    if (Number.isFinite(parsed) && parsed > 0)
      config.tokenBudget.dailyTotal = Math.floor(parsed)
    else {
      console.warn(
        '[cli] invalid MIMIKIT_TOKEN_BUDGET_DAILY:',
        envTokenBudgetDaily,
      )
    }
  }
  const enabled = parseEnvBoolean(
    'MIMIKIT_TOKEN_BUDGET_ENABLED',
    process.env.MIMIKIT_TOKEN_BUDGET_ENABLED?.trim(),
  )
  if (enabled !== undefined) config.tokenBudget.enabled = enabled
}

const applyEvolveEnv = (config: SupervisorConfig): void => {
  const evolveEnabled = parseEnvBoolean(
    'MIMIKIT_EVOLVE_ENABLED',
    process.env.MIMIKIT_EVOLVE_ENABLED?.trim(),
  )
  if (evolveEnabled !== undefined) config.evolve.enabled = evolveEnabled
  const autoRestart = parseEnvBoolean(
    'MIMIKIT_EVOLVE_AUTO_RESTART_ON_PROMOTE',
    process.env.MIMIKIT_EVOLVE_AUTO_RESTART_ON_PROMOTE?.trim(),
  )
  if (autoRestart !== undefined)
    console.warn(
      '[cli] MIMIKIT_EVOLVE_AUTO_RESTART_ON_PROMOTE is deprecated and ignored',
    )
  const evolveIdlePollMs = parseEnvPositiveInteger(
    'MIMIKIT_EVOLVE_IDLE_POLL_MS',
    process.env.MIMIKIT_EVOLVE_IDLE_POLL_MS?.trim(),
  )
  if (evolveIdlePollMs !== undefined)
    config.evolve.idlePollMs = evolveIdlePollMs
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
  if (minPassRateDelta !== undefined)
    console.warn(
      '[cli] MIMIKIT_EVOLVE_MIN_PASS_RATE_DELTA is deprecated and ignored',
    )
  const minTokenDelta = parseEnvNonNegativeNumber(
    'MIMIKIT_EVOLVE_MIN_TOKEN_DELTA',
    process.env.MIMIKIT_EVOLVE_MIN_TOKEN_DELTA?.trim(),
  )
  if (minTokenDelta !== undefined)
    console.warn(
      '[cli] MIMIKIT_EVOLVE_MIN_TOKEN_DELTA is deprecated and ignored',
    )
  const minLatencyDeltaMs = parseEnvNonNegativeNumber(
    'MIMIKIT_EVOLVE_MIN_LATENCY_DELTA_MS',
    process.env.MIMIKIT_EVOLVE_MIN_LATENCY_DELTA_MS?.trim(),
  )
  if (minLatencyDeltaMs !== undefined)
    console.warn(
      '[cli] MIMIKIT_EVOLVE_MIN_LATENCY_DELTA_MS is deprecated and ignored',
    )
  const feedbackHistoryLimit = parseEnvPositiveInteger(
    'MIMIKIT_EVOLVE_FEEDBACK_HISTORY_LIMIT',
    process.env.MIMIKIT_EVOLVE_FEEDBACK_HISTORY_LIMIT?.trim(),
  )
  if (feedbackHistoryLimit !== undefined)
    config.evolve.feedbackHistoryLimit = feedbackHistoryLimit
  const feedbackSuiteMaxCases = parseEnvPositiveInteger(
    'MIMIKIT_EVOLVE_FEEDBACK_SUITE_MAX_CASES',
    process.env.MIMIKIT_EVOLVE_FEEDBACK_SUITE_MAX_CASES?.trim(),
  )
  if (feedbackSuiteMaxCases !== undefined)
    console.warn(
      '[cli] MIMIKIT_EVOLVE_FEEDBACK_SUITE_MAX_CASES is deprecated and ignored',
    )
  const issueMinRoi = parseEnvNonNegativeNumber(
    'MIMIKIT_EVOLVE_ISSUE_MIN_ROI_SCORE',
    process.env.MIMIKIT_EVOLVE_ISSUE_MIN_ROI_SCORE?.trim(),
  )
  if (issueMinRoi !== undefined)
    config.evolve.issueMinRoiScore = Math.floor(issueMinRoi)
  const issueMaxCount = parseEnvPositiveInteger(
    'MIMIKIT_EVOLVE_ISSUE_MAX_COUNT_PER_ROUND',
    process.env.MIMIKIT_EVOLVE_ISSUE_MAX_COUNT_PER_ROUND?.trim(),
  )
  if (issueMaxCount !== undefined)
    config.evolve.issueMaxCountPerRound = issueMaxCount
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

export const applyCliEnvOverrides = (config: SupervisorConfig): void => {
  applyModelEnv(config)
  applyReasoningEnv(config)
  applyTokenBudgetEnv(config)
  applyEvolveEnv(config)
}
