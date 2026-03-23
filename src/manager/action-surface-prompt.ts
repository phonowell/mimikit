import {
  renderActionDetailAll,
  renderActionDetailFeedback,
  renderActionDetailHeading,
  renderActionDetailLine,
  renderActionDomainBoundary,
  renderActionDomainHeading,
  renderActionSummaryLine,
  renderActionSurfaceIntro,
} from './action-prompt-spec.js'
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

const formatActionSummary = (action: ManagerActionDefinition): string =>
  renderActionSummaryLine({
    name: action.name,
    prompt: action.prompt,
  })

const formatActionDetail = (action: ManagerActionDefinition): string =>
  renderActionDetailLine({
    name: action.name,
    prompt: action.prompt,
  })

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
    renderActionSurfaceIntro(config.surface.wakeProfile),
    ...config.surface.domains.flatMap((domain) => {
      const actions = config.surface.actions.filter(
        (action) => action.domain === domain.domain,
      )
      return [
        renderActionDomainHeading(domain.title),
        renderActionDomainBoundary(domain.summary),
        ...actions.map(formatActionSummary),
      ]
    }),
    ...(detailSection.length === 0
      ? []
      : [
          renderActionDetailHeading(),
          config.includeAllDetails
            ? renderActionDetailAll()
            : renderActionDetailFeedback(
                detailSection.map((action) => `M:${action.name}`),
              ),
          ...detailSection.map(formatActionDetail),
        ]),
  ].join('\n')
}
