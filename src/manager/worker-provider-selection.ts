import type { AppConfig } from '../config.js'
import type {
  ProviderBilling,
  ProviderCapability,
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
