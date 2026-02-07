import type { ReplayReport } from '../eval/replay-types.js'

export type PromotionDecision = {
  promote: boolean
  reason: string
}

const compareNumber = (candidate: number, baseline: number): -1 | 0 | 1 => {
  if (candidate < baseline) return -1
  if (candidate > baseline) return 1
  return 0
}

export const decidePromptPromotion = (
  baseline: ReplayReport,
  candidate: ReplayReport,
): PromotionDecision => {
  const passRateCompare = compareNumber(candidate.passRate, baseline.passRate)
  if (passRateCompare > 0)
    return { promote: true, reason: 'pass_rate_improved' }
  if (passRateCompare < 0)
    return { promote: false, reason: 'pass_rate_regressed' }

  const tokenCompare = compareNumber(
    candidate.metrics.usage.total,
    baseline.metrics.usage.total,
  )
  if (tokenCompare < 0) return { promote: true, reason: 'token_total_reduced' }
  if (tokenCompare > 0)
    return { promote: false, reason: 'token_total_increased' }

  const latencyCompare = compareNumber(
    candidate.metrics.llmElapsedMs,
    baseline.metrics.llmElapsedMs,
  )
  if (latencyCompare < 0)
    return { promote: true, reason: 'llm_elapsed_reduced' }

  return { promote: false, reason: 'no_measurable_gain' }
}
