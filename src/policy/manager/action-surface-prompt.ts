import {
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

export type ManagerActionSurfacePromptConfig = {
  surface: ManagerActionSurface
}

const formatActionSummary = (action: ManagerActionDefinition): string =>
  renderActionSummaryLine({
    name: action.name,
    prompt: action.prompt,
  })

export const resolveManagerActionSurfacePromptConfig =
  (): ManagerActionSurfacePromptConfig => ({
    surface: resolveManagerActionSurface(),
  })

export const formatManagerActionSurfacePrompt = (
  params: ManagerActionSurface | ManagerActionSurfacePromptConfig,
): string => {
  const config = 'surface' in params ? params : { surface: params }

  return [
    renderActionSurfaceIntro(),
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
  ].join('\n')
}
