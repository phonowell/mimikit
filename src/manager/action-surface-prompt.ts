import {
  type ManagerActionSurface,
  resolveManagerActionSurface,
} from './action-surface.js'

import type { ManagerActionDefinition } from './action-registry-shared.js'
import type {
  ManagerActionFeedback,
  ManagerPacketMode,
  ManagerWakeProfile,
} from '../types/index.js'

export type ManagerActionSurfacePromptConfig = {
  surface: ManagerActionSurface
  detailActionNames: Set<string>
  includeAllDetails: boolean
}

const DETAIL_FEEDBACK_ERRORS = new Set([
  'invalid_action_args',
  'action_execution_rejected',
])

const formatActionSummary = (action: ManagerActionDefinition): string => {
  const summary = action.prompt.summary.replace(/[。.]$/, '')
  const constraints =
    action.prompt.briefConstraints && action.prompt.briefConstraints.length > 0
      ? `；${action.prompt.briefConstraints.join('；')}`
      : ''
  return `- \`M:${action.name}\`：${summary}${constraints}`
}

const formatActionDetail = (action: ManagerActionDefinition): string => {
  const summary = action.prompt.summary.replace(/[。.]$/, '')
  const constraints = [
    ...(action.prompt.briefConstraints ?? []),
    ...(action.prompt.detailConstraints ?? []),
  ]
  const suffix = constraints.length > 0 ? `；${constraints.join('；')}` : ''
  return `- \`M:${action.name}\`：${summary}${suffix}`
}

export const resolveManagerActionSurfacePromptConfig = (params: {
  wakeProfile: ManagerWakeProfile
  packetMode?: ManagerPacketMode
  actionFeedback?: readonly ManagerActionFeedback[]
}): ManagerActionSurfacePromptConfig => {
  const surface = resolveManagerActionSurface(params.wakeProfile)
  const detailActionNames = new Set<string>()

  for (const item of params.actionFeedback ?? []) {
    if (!DETAIL_FEEDBACK_ERRORS.has(item.error)) continue
    if (!surface.actionNames.has(item.action)) continue
    detailActionNames.add(item.action)
  }

  if (detailActionNames.size > 0) {
    return {
      surface,
      detailActionNames,
      includeAllDetails: false,
    }
  }

  return {
    surface,
    detailActionNames: new Set<string>(),
    includeAllDetails: params.packetMode === 'expanded',
  }
}

export const formatManagerActionSurfacePrompt = (
  params: ManagerActionSurface | ManagerActionSurfacePromptConfig,
): string => {
  const config =
    'surface' in params
      ? params
      : {
          surface: params,
          detailActionNames: new Set<string>(),
          includeAllDetails: false,
        }
  const detailNames = config.includeAllDetails
    ? config.surface.actionNames
    : config.detailActionNames
  const detailSection = config.surface.actions.filter((action) =>
    detailNames.has(action.name),
  )

  return [
    `- 当前 wake_profile=\`${config.surface.wakeProfile}\`；默认仅注入简版 action 卡，未列出的 action 视为本轮不可用。`,
    ...config.surface.domains.flatMap((domain) => {
      const actions = config.surface.actions.filter(
        (action) => action.domain === domain.domain,
      )
      return [
        `### ${domain.title}`,
        `- 边界：${domain.summary}`,
        ...actions.map(formatActionSummary),
      ]
    }),
    ...(detailSection.length === 0
      ? []
      : [
          '### 详细参数契约（按需注入）',
          config.includeAllDetails
            ? '- 当前为 follow-up/expanded 轮，补充本轮可用 action 的完整约束。'
            : `- 当前按反馈补充失败 action：${detailSection
                .map((action) => `M:${action.name}`)
                .join(', ')}。`,
          ...detailSection.map(formatActionDetail),
        ]),
  ].join('\n')
}
