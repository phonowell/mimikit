import type { ManagerTurnDecision } from './manager-turn-schema.js'
import type {
  ManagerActionFeedback,
  TaskResult,
} from '../../foundation/types/index.js'

const hasExplicitStopDecision = (
  decision: ManagerTurnDecision | undefined,
): boolean => decision?.mode === 'handoff' || decision?.mode === 'escalate'

const hasStructuredRisks = (result: TaskResult): boolean =>
  (result.handoff?.risks ?? []).some((item) => item.trim().length > 0)

export const hasSupportedStopDecision = (params: {
  decision: ManagerTurnDecision | undefined
  result: TaskResult
  priorActionFeedback?: ManagerActionFeedback[]
}): boolean => {
  const { decision } = params
  if (!decision) return false
  if (!hasExplicitStopDecision(decision)) return false
  switch (decision.reason) {
    case 'high_risk':
    case 'evidence_conflict':
    case 'evidence_insufficient':
      return hasStructuredRisks(params.result)
    case 'repair_budget_exceeded':
      return Boolean(params.priorActionFeedback?.length)
    default:
      return false
  }
}
