import { ACTION_DOMAIN_SPECS } from './action-prompt-spec.js'
import { ACTION_DEFINITIONS } from './action-registry-definitions.js'

import type { ManagerActionDomain } from './action-registry-shared.js'
type ManagerActionDomainSpec = (typeof ACTION_DOMAIN_SPECS)[ManagerActionDomain]

export type ManagerActionSurface = {
  domains: ManagerActionDomainSpec[]
  actions: typeof ACTION_DEFINITIONS
  actionNames: Set<string>
}

const DOMAIN_SPEC_BY_NAME = new Map(
  Object.values(ACTION_DOMAIN_SPECS).map((spec) => [spec.domain, spec]),
)

export const resolveManagerActionSurface = (): ManagerActionSurface => {
  const domains = Object.values(ACTION_DOMAIN_SPECS)
    .map((spec) => DOMAIN_SPEC_BY_NAME.get(spec.domain))
    .filter((item): item is ManagerActionDomainSpec => item !== undefined)
  return {
    domains,
    actions: ACTION_DEFINITIONS,
    actionNames: new Set(ACTION_DEFINITIONS.map((action) => action.name)),
  }
}
