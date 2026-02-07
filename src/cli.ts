import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { defaultConfig } from './config.js'
import { buildPaths } from './fs/paths.js'
import { createHttpServer } from './http/index.js'
import { loadCodexSettings } from './llm/openai.js'
import { setDefaultLogPath } from './log/safe.js'
import { Supervisor } from './supervisor/supervisor.js'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

const { values } = parseArgs({
  options: {
    port: { type: 'string', short: 'p', default: '8787' },
    'state-dir': { type: 'string', default: '.mimikit' },
    'work-dir': { type: 'string', default: '.' },
  },
})

const portValue = values.port
const stateDir = values['state-dir']
const workDir = values['work-dir']

const resolvedStateDir = resolve(stateDir)
const resolvedWorkDir = resolve(workDir)
setDefaultLogPath(buildPaths(resolvedStateDir).log)
await loadCodexSettings()

const parsePort = (value: string): string => {
  const num = Number(value)
  if (!Number.isInteger(num) || num <= 0 || num > 65535) {
    console.error(`[cli] invalid port: ${value}`)
    process.exit(1)
  }
  return String(num)
}

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

const port = parsePort(portValue)

const config = defaultConfig({
  stateDir: resolvedStateDir,
  workDir: resolvedWorkDir,
})

const envModel = process.env.MIMIKIT_MODEL?.trim()
if (envModel) config.manager.model = envModel
const envWorkerModel = process.env.MIMIKIT_WORKER_MODEL?.trim()
if (envWorkerModel) config.worker.model = envWorkerModel
const envReasoning = process.env.MIMIKIT_REASONING_EFFORT?.trim()
if (envReasoning) {
  const allowed: ModelReasoningEffort[] = [
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
  ]
  if (allowed.includes(envReasoning as ModelReasoningEffort))
    config.manager.modelReasoningEffort = envReasoning as ModelReasoningEffort
  else console.warn('[cli] invalid MIMIKIT_REASONING_EFFORT:', envReasoning)
}

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

const envTokenBudgetEnabled = process.env.MIMIKIT_TOKEN_BUDGET_ENABLED?.trim()
if (envTokenBudgetEnabled) {
  if (envTokenBudgetEnabled === '1' || envTokenBudgetEnabled === 'true')
    config.tokenBudget.enabled = true
  else if (envTokenBudgetEnabled === '0' || envTokenBudgetEnabled === 'false')
    config.tokenBudget.enabled = false
  else {
    console.warn(
      '[cli] invalid MIMIKIT_TOKEN_BUDGET_ENABLED:',
      envTokenBudgetEnabled,
    )
  }
}

const envEvolveEnabled = parseEnvBoolean(
  'MIMIKIT_EVOLVE_ENABLED',
  process.env.MIMIKIT_EVOLVE_ENABLED?.trim(),
)
if (envEvolveEnabled !== undefined) config.evolve.enabled = envEvolveEnabled

const envEvolveAutoRestart = parseEnvBoolean(
  'MIMIKIT_EVOLVE_AUTO_RESTART_ON_PROMOTE',
  process.env.MIMIKIT_EVOLVE_AUTO_RESTART_ON_PROMOTE?.trim(),
)
if (envEvolveAutoRestart !== undefined)
  config.evolve.autoRestartOnPromote = envEvolveAutoRestart

const envEvolveIdlePollMs = parseEnvPositiveInteger(
  'MIMIKIT_EVOLVE_IDLE_POLL_MS',
  process.env.MIMIKIT_EVOLVE_IDLE_POLL_MS?.trim(),
)
if (envEvolveIdlePollMs !== undefined)
  config.evolve.idlePollMs = envEvolveIdlePollMs

const envEvolveMaxRounds = parseEnvPositiveInteger(
  'MIMIKIT_EVOLVE_MAX_ROUNDS',
  process.env.MIMIKIT_EVOLVE_MAX_ROUNDS?.trim(),
)
if (envEvolveMaxRounds !== undefined)
  config.evolve.maxRounds = envEvolveMaxRounds

const envEvolveMinPassRateDelta = parseEnvNonNegativeNumber(
  'MIMIKIT_EVOLVE_MIN_PASS_RATE_DELTA',
  process.env.MIMIKIT_EVOLVE_MIN_PASS_RATE_DELTA?.trim(),
)
if (envEvolveMinPassRateDelta !== undefined)
  config.evolve.minPassRateDelta = envEvolveMinPassRateDelta

const envEvolveMinTokenDelta = parseEnvNonNegativeNumber(
  'MIMIKIT_EVOLVE_MIN_TOKEN_DELTA',
  process.env.MIMIKIT_EVOLVE_MIN_TOKEN_DELTA?.trim(),
)
if (envEvolveMinTokenDelta !== undefined)
  config.evolve.minTokenDelta = Math.floor(envEvolveMinTokenDelta)

const envEvolveMinLatencyDeltaMs = parseEnvNonNegativeNumber(
  'MIMIKIT_EVOLVE_MIN_LATENCY_DELTA_MS',
  process.env.MIMIKIT_EVOLVE_MIN_LATENCY_DELTA_MS?.trim(),
)
if (envEvolveMinLatencyDeltaMs !== undefined)
  config.evolve.minLatencyDeltaMs = Math.floor(envEvolveMinLatencyDeltaMs)

const envEvolveFeedbackHistoryLimit = parseEnvPositiveInteger(
  'MIMIKIT_EVOLVE_FEEDBACK_HISTORY_LIMIT',
  process.env.MIMIKIT_EVOLVE_FEEDBACK_HISTORY_LIMIT?.trim(),
)
if (envEvolveFeedbackHistoryLimit !== undefined)
  config.evolve.feedbackHistoryLimit = envEvolveFeedbackHistoryLimit

const envEvolveFeedbackSuiteMaxCases = parseEnvPositiveInteger(
  'MIMIKIT_EVOLVE_FEEDBACK_SUITE_MAX_CASES',
  process.env.MIMIKIT_EVOLVE_FEEDBACK_SUITE_MAX_CASES?.trim(),
)
if (envEvolveFeedbackSuiteMaxCases !== undefined)
  config.evolve.feedbackSuiteMaxCases = envEvolveFeedbackSuiteMaxCases

console.log('[cli] config:', config)

const supervisor = new Supervisor(config)

await supervisor.start()
createHttpServer(supervisor, config, parseInt(port, 10))

const shutdown = (reason: string) => {
  console.log(`\n[cli] ${reason}`)
  void (async () => {
    await supervisor.stopAndPersist()
    process.exit(0)
  })()
}

process.on('SIGINT', () => {
  shutdown('shutting down...')
})

process.on('SIGTERM', () => {
  shutdown('received SIGTERM, shutting down...')
})
