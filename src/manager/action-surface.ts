import { ACTION_DOMAIN_SPECS } from './action-prompt-spec.js'
import { ACTION_DEFINITIONS } from './action-registry-definitions.js'

import type { ManagerActionDomain } from './action-registry-shared.js'
import type { ManagerWakeProfile } from '../types/index.js'
type ManagerActionDomainSpec = (typeof ACTION_DOMAIN_SPECS)[ManagerActionDomain]

export type ManagerActionSurface = {
  wakeProfile: ManagerWakeProfile
  domains: ManagerActionDomainSpec[]
  actions: typeof ACTION_DEFINITIONS
  actionNames: Set<string>
}

const WAKE_PROFILE_DOMAIN_ORDER: Record<
  ManagerWakeProfile,
  readonly ManagerActionDomain[]
> = {
  user_input: ['task', 'plan', 'dialog', 'focus', 'memory'],
  mixed: ['task', 'plan', 'dialog', 'focus', 'memory'],
  task_result: ['task', 'plan'],
  trigger: ['task', 'plan'],
  capacity: ['task', 'plan'],
}

const WAKE_PROFILE_EXCLUDED_ACTIONS: Partial<
  Record<ManagerWakeProfile, ReadonlySet<string>>
> = {
  task_result: new Set(['enqueue_task', 'mutate_task']),
  trigger: new Set(['mutate_task', 'set_task_result_summary']),
  capacity: new Set(['mutate_task', 'set_task_result_summary']),
}

const DOMAIN_SPEC_BY_NAME = new Map(
  Object.values(ACTION_DOMAIN_SPECS).map((spec) => [spec.domain, spec]),
)

export const resolveManagerActionSurface = (
  wakeProfile: ManagerWakeProfile,
): ManagerActionSurface => {
  const allowedDomains = WAKE_PROFILE_DOMAIN_ORDER[wakeProfile]
  const domainSet = new Set(allowedDomains)
  const excludedActions = WAKE_PROFILE_EXCLUDED_ACTIONS[wakeProfile]
  const actions = ACTION_DEFINITIONS.filter(
    (definition) =>
      domainSet.has(definition.domain) &&
      !excludedActions?.has(definition.name),
  )
  return {
    wakeProfile,
    domains: allowedDomains
      .map((domain) => DOMAIN_SPEC_BY_NAME.get(domain))
      .filter((item): item is ManagerActionDomainSpec => item !== undefined),
    actions,
    actionNames: new Set(actions.map((action) => action.name)),
  }
}

const formatAllowedActionList = (surface: ManagerActionSurface): string =>
  surface.actions.map((action) => `M:${action.name}`).join(', ')

export const formatBlockedActionSurfaceHint = (params: {
  action: string
  wakeProfile: ManagerWakeProfile
}): string => {
  const surface = resolveManagerActionSurface(params.wakeProfile)
  return `当前 wake_profile=${params.wakeProfile} 不开放 M:${params.action}。本轮仅允许：${formatAllowedActionList(surface)}。`
}
