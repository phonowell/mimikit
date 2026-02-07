import type { SelfEvolveRoundResult } from './round.js'

export const isRoundImprovement = (
  baseline: SelfEvolveRoundResult['baseline'],
  candidate: SelfEvolveRoundResult['candidate'],
): boolean => {
  if (candidate.passRate !== baseline.passRate)
    return candidate.passRate > baseline.passRate
  if (candidate.usageTotal !== baseline.usageTotal)
    return candidate.usageTotal < baseline.usageTotal
  return candidate.llmElapsedMs < baseline.llmElapsedMs
}
