import { parseEnvBoolean, parseEnvPositiveInteger } from './cli-env-parse.js'
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
  const envWorkerStandardModel =
    process.env.MIMIKIT_WORKER_STANDARD_MODEL?.trim()
  if (envWorkerStandardModel)
    config.worker.standard.model = envWorkerStandardModel
  const envWorkerExpertModel = process.env.MIMIKIT_WORKER_EXPERT_MODEL?.trim()
  if (envWorkerExpertModel) config.worker.expert.model = envWorkerExpertModel
}

const applyReportingEnv = (config: AppConfig): void => {
  const dailyReportEnabled = parseEnvBoolean(
    'MIMIKIT_REPORTING_DAILY_ENABLED',
    process.env.MIMIKIT_REPORTING_DAILY_ENABLED?.trim(),
  )
  if (dailyReportEnabled !== undefined)
    config.reporting.dailyReportEnabled = dailyReportEnabled

  const runtimeHighLatencyMs = parseEnvPositiveInteger(
    'MIMIKIT_REPORTING_RUNTIME_HIGH_LATENCY_MS',
    process.env.MIMIKIT_REPORTING_RUNTIME_HIGH_LATENCY_MS?.trim(),
  )
  if (runtimeHighLatencyMs !== undefined)
    config.reporting.runtimeHighLatencyMs = runtimeHighLatencyMs

  const runtimeHighUsageTotal = parseEnvPositiveInteger(
    'MIMIKIT_REPORTING_RUNTIME_HIGH_USAGE_TOTAL',
    process.env.MIMIKIT_REPORTING_RUNTIME_HIGH_USAGE_TOTAL?.trim(),
  )
  if (runtimeHighUsageTotal !== undefined)
    config.reporting.runtimeHighUsageTotal = runtimeHighUsageTotal
}

export const applyCliEnvOverrides = (config: AppConfig): void => {
  applyModelEnv(config)
  applyReasoningEnv(config)
  applyReportingEnv(config)
}
