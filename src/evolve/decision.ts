import type { ReplayReport } from '../eval/replay-types.js'

export type PromotionDecision = {
  promote: boolean
  reason: string
}

export type PromotionPolicy = {
  minPassRateDelta: number
  minTokenDelta: number
  minLatencyDeltaMs: number
}

export const defaultPromotionPolicy = (): PromotionPolicy => ({
  minPassRateDelta: 0,
  minTokenDelta: 50,
  minLatencyDeltaMs: 200,
})

export const decidePromptPromotion = (
  baseline: ReplayReport,
  candidate: ReplayReport,
  policy = defaultPromotionPolicy(),
): PromotionDecision => {
  const passRateDelta = candidate.passRate - baseline.passRate
  if (passRateDelta > policy.minPassRateDelta)
    return { promote: true, reason: 'pass_rate_improved' }
  if (passRateDelta < -policy.minPassRateDelta)
    return { promote: false, reason: 'pass_rate_regressed' }

  const baselineTokens = baseline.metrics.usage.total
  const candidateTokens = candidate.metrics.usage.total
  const tokenDelta = baselineTokens - candidateTokens
  if (tokenDelta >= policy.minTokenDelta)
    return { promote: true, reason: 'token_total_reduced' }
  if (tokenDelta <= -policy.minTokenDelta)
    return { promote: false, reason: 'token_total_increased' }

  const baselineLatency = baseline.metrics.llmElapsedMs
  const candidateLatency = candidate.metrics.llmElapsedMs
  const latencyDelta = baselineLatency - candidateLatency
  if (latencyDelta >= policy.minLatencyDeltaMs)
    return { promote: true, reason: 'llm_elapsed_reduced' }
  if (latencyDelta <= -policy.minLatencyDeltaMs)
    return { promote: false, reason: 'llm_elapsed_increased' }

  return { promote: false, reason: 'no_measurable_gain' }
}
