import { defaultPromotionPolicy, type PromotionPolicy } from './decision.js'

import type { SelfEvolveRoundResult } from './round.js'

export const isRoundImprovement = (
  baseline: SelfEvolveRoundResult['baseline'],
  candidate: SelfEvolveRoundResult['candidate'],
  policy = defaultPromotionPolicy(),
): boolean => {
  const passRateDelta = candidate.passRate - baseline.passRate
  if (passRateDelta > policy.minPassRateDelta) return true
  if (passRateDelta < -policy.minPassRateDelta) return false

  const tokenDelta = baseline.usageTotal - candidate.usageTotal
  if (tokenDelta >= policy.minTokenDelta) return true
  if (tokenDelta <= -policy.minTokenDelta) return false

  const latencyDelta = baseline.llmElapsedMs - candidate.llmElapsedMs
  if (latencyDelta >= policy.minLatencyDeltaMs) return true
  return false
}

export const buildPromotionPolicy = (params?: {
  minPassRateDelta?: number
  minTokenDelta?: number
  minLatencyDeltaMs?: number
}): PromotionPolicy => {
  const defaults = defaultPromotionPolicy()
  return {
    minPassRateDelta: params?.minPassRateDelta ?? defaults.minPassRateDelta,
    minTokenDelta: params?.minTokenDelta ?? defaults.minTokenDelta,
    minLatencyDeltaMs: params?.minLatencyDeltaMs ?? defaults.minLatencyDeltaMs,
  }
}
