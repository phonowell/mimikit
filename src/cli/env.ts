import { parseEnvBoolean, parseEnvPositiveInteger } from './env-parse.js'
import { applyReasoningEnv } from './env-reasoning.js'

import type { AppConfig } from '../config.js'

const applyModelEnv = (config: AppConfig): void => {
  const envModel = process.env.MIMIKIT_MODEL?.trim()
  if (envModel) {
    config.manager.model = envModel
    config.worker.standard.model = envModel
  }
  const envManagerModel = process.env.MIMIKIT_MANAGER_MODEL?.trim()
  if (envManagerModel) config.manager.model = envManagerModel
  const envWorkerStandardModel =
    process.env.MIMIKIT_WORKER_STANDARD_MODEL?.trim()
  if (envWorkerStandardModel)
    config.worker.standard.model = envWorkerStandardModel
  const envWorkerSpecialistModel =
    process.env.MIMIKIT_WORKER_SPECIALIST_MODEL?.trim()
  if (envWorkerSpecialistModel)
    config.worker.specialist.model = envWorkerSpecialistModel
}

const applyLoopEnv = (config: AppConfig): void => {
  const evolverEnabled = parseEnvBoolean(
    'MIMIKIT_EVOLVER_ENABLED',
    process.env.MIMIKIT_EVOLVER_ENABLED?.trim(),
  )
  if (evolverEnabled !== undefined) config.evolver.enabled = evolverEnabled

  const managerPollMs = parseEnvPositiveInteger(
    'MIMIKIT_MANAGER_POLL_MS',
    process.env.MIMIKIT_MANAGER_POLL_MS?.trim(),
  )
  if (managerPollMs !== undefined) config.manager.pollMs = managerPollMs

  const managerMinIntervalMs = parseEnvPositiveInteger(
    'MIMIKIT_MANAGER_MIN_INTERVAL_MS',
    process.env.MIMIKIT_MANAGER_MIN_INTERVAL_MS?.trim(),
  )
  if (managerMinIntervalMs !== undefined)
    config.manager.minIntervalMs = managerMinIntervalMs

  const managerMaxBatch = parseEnvPositiveInteger(
    'MIMIKIT_MANAGER_MAX_BATCH',
    process.env.MIMIKIT_MANAGER_MAX_BATCH?.trim(),
  )
  if (managerMaxBatch !== undefined) config.manager.maxBatch = managerMaxBatch

  const managerQueueCompactMinPackets = parseEnvPositiveInteger(
    'MIMIKIT_MANAGER_QUEUE_COMPACT_MIN_PACKETS',
    process.env.MIMIKIT_MANAGER_QUEUE_COMPACT_MIN_PACKETS?.trim(),
  )
  if (managerQueueCompactMinPackets !== undefined)
    config.manager.queueCompactMinPackets = managerQueueCompactMinPackets

  const managerTaskSnapshotMaxCount = parseEnvPositiveInteger(
    'MIMIKIT_MANAGER_TASK_SNAPSHOT_MAX_COUNT',
    process.env.MIMIKIT_MANAGER_TASK_SNAPSHOT_MAX_COUNT?.trim(),
  )
  if (managerTaskSnapshotMaxCount !== undefined)
    config.manager.taskSnapshotMaxCount = managerTaskSnapshotMaxCount

  const evolverPollMs = parseEnvPositiveInteger(
    'MIMIKIT_EVOLVER_POLL_MS',
    process.env.MIMIKIT_EVOLVER_POLL_MS?.trim(),
  )
  if (evolverPollMs !== undefined) config.evolver.pollMs = evolverPollMs

  const evolverIdleThresholdMs = parseEnvPositiveInteger(
    'MIMIKIT_EVOLVER_IDLE_THRESHOLD_MS',
    process.env.MIMIKIT_EVOLVER_IDLE_THRESHOLD_MS?.trim(),
  )
  if (evolverIdleThresholdMs !== undefined)
    config.evolver.idleThresholdMs = evolverIdleThresholdMs

  const evolverMinIntervalMs = parseEnvPositiveInteger(
    'MIMIKIT_EVOLVER_MIN_INTERVAL_MS',
    process.env.MIMIKIT_EVOLVER_MIN_INTERVAL_MS?.trim(),
  )
  if (evolverMinIntervalMs !== undefined)
    config.evolver.minIntervalMs = evolverMinIntervalMs
}

export const applyCliEnvOverrides = (config: AppConfig): void => {
  applyModelEnv(config)
  applyReasoningEnv(config)
  applyLoopEnv(config)
}
