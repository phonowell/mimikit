import { resolveTaskChangeAt } from '../shared/task-state.js'

import type { AppConfig } from '../config.js'
import type {
  FocusId,
  ProviderBilling,
  ProviderCapability,
  Task,
  WorkerProvider,
} from '../types/index.js'

type EnabledWorkerProvider = {
  provider: WorkerProvider
  billing: ProviderBilling
  capability: ProviderCapability
}

const BILLING_RANK: Record<ProviderBilling, number> = {
  free: 0,
  low: 1,
  medium: 2,
  high: 3,
}

const CAPABILITY_RANK: Record<ProviderCapability, number> = {
  low: 0,
  medium: 1,
  high: 2,
}

export const compareWorkerProviderPreference = (
  left: EnabledWorkerProvider,
  right: EnabledWorkerProvider,
): number => {
  const billingDiff = BILLING_RANK[left.billing] - BILLING_RANK[right.billing]
  if (billingDiff !== 0) return billingDiff

  const capabilityDiff =
    CAPABILITY_RANK[right.capability] - CAPABILITY_RANK[left.capability]
  if (capabilityDiff !== 0) return capabilityDiff

  return left.provider.localeCompare(right.provider)
}

export const listEnabledWorkerProviders = (
  config: AppConfig,
): EnabledWorkerProvider[] => {
  const providers: EnabledWorkerProvider[] = []
  if (config.codex.enabled) {
    providers.push({
      provider: 'codex',
      capability: config.codex.capability,
      billing: config.codex.billing,
    })
  }
  if (config.opencode.enabled) {
    providers.push({
      provider: 'opencode',
      capability: config.opencode.capability,
      billing: config.opencode.billing,
    })
  }
  return providers
}

export const resolvePreferredWorkerProvider = (
  config: AppConfig,
): WorkerProvider | undefined => {
  const enabled = listEnabledWorkerProviders(config)
  if (enabled.length === 0) return undefined
  enabled.sort(compareWorkerProviderPreference)
  return enabled[0]?.provider
}

const isEnabledProvider = (
  config: AppConfig,
  provider: WorkerProvider,
): boolean =>
  listEnabledWorkerProviders(config).some((item) => item.provider === provider)

const compareAffinityTaskDesc = (left: Task, right: Task): number => {
  const leftRank =
    left.status === 'running' || left.status === 'pending'
      ? 0
      : left.status === 'paused'
        ? 1
        : left.status === 'succeeded'
          ? 2
          : left.status === 'failed'
            ? 3
            : 4
  const rightRank =
    right.status === 'running' || right.status === 'pending'
      ? 0
      : right.status === 'paused'
        ? 1
        : right.status === 'succeeded'
          ? 2
          : right.status === 'failed'
            ? 3
            : 4
  if (leftRank !== rightRank) return leftRank - rightRank
  const timeDiff =
    Date.parse(resolveTaskChangeAt(right)) -
    Date.parse(resolveTaskChangeAt(left))
  if (timeDiff !== 0) return timeDiff
  return left.id.localeCompare(right.id)
}

export const resolveFocusAffinitizedWorkerProvider = (params: {
  config: AppConfig
  tasks: Task[]
  focusId: FocusId
}): WorkerProvider | undefined => {
  const candidates = params.tasks
    .filter(
      (task) =>
        task.focusId === params.focusId &&
        task.status !== 'canceled' &&
        isEnabledProvider(params.config, task.provider),
    )
    .sort(compareAffinityTaskDesc)
  return candidates[0]?.provider
}
