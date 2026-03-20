import { ACTION_DEFINITIONS } from './action-registry-definitions.js'

import type { ManagerActionDomain } from './action-registry-shared.js'
import type { ManagerWakeProfile } from '../types/index.js'

type ManagerActionDomainSpec = {
  domain: ManagerActionDomain
  title: string
  summary: string
}

export type ManagerActionSurface = {
  wakeProfile: ManagerWakeProfile
  domains: ManagerActionDomainSpec[]
  actions: typeof ACTION_DEFINITIONS
  actionNames: Set<string>
}

const ACTION_DOMAIN_SPECS: readonly ManagerActionDomainSpec[] = [
  {
    domain: 'lookup',
    title: '读取与检索',
    summary: '只读拉取补充上下文，不直接改运行时状态。',
  },
  {
    domain: 'task',
    title: '任务调度',
    summary: '创建、控制任务，或消费本批次任务结果。',
  },
  {
    domain: 'plan',
    title: '计划调度',
    summary: '创建、更新、删除持续触发的计划。',
  },
  {
    domain: 'dialog',
    title: '用户交互',
    summary: '仅用于必须留待用户返回后做有限选择的场景。',
  },
  {
    domain: 'focus',
    title: 'Focus 归属',
    summary: '维护 focus 状态与对象归属。',
  },
  {
    domain: 'memory',
    title: '长期记忆',
    summary: '仅保存跨轮稳定生效的偏好或约束。',
  },
] as const

const WAKE_PROFILE_DOMAIN_ORDER: Record<
  ManagerWakeProfile,
  readonly ManagerActionDomain[]
> = {
  user_input: ['lookup', 'task', 'plan', 'dialog', 'focus', 'memory'],
  mixed: ['lookup', 'task', 'plan', 'dialog', 'focus', 'memory'],
  task_result: ['lookup', 'task', 'plan'],
  trigger: ['lookup', 'task', 'plan'],
  capacity: ['lookup', 'task', 'plan'],
}

const DOMAIN_SPEC_BY_NAME = new Map(
  ACTION_DOMAIN_SPECS.map((spec) => [spec.domain, spec]),
)

export const resolveManagerActionSurface = (
  wakeProfile: ManagerWakeProfile,
): ManagerActionSurface => {
  const allowedDomains = WAKE_PROFILE_DOMAIN_ORDER[wakeProfile]
  const domainSet = new Set(allowedDomains)
  const actions = ACTION_DEFINITIONS.filter((definition) =>
    domainSet.has(definition.domain),
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
