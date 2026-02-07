import { expect, test } from 'vitest'

import { decideAggregatePromotion } from '../src/evolve/decision.js'

test('aggregate decision uses weighted metrics', () => {
  const baseline = {
    weightedPassRate: 0.9,
    weightedUsageTotal: 1200,
    weightedLlmElapsedMs: 2000,
  }
  const candidate = {
    weightedPassRate: 0.9,
    weightedUsageTotal: 1100,
    weightedLlmElapsedMs: 2200,
  }
  const decision = decideAggregatePromotion(baseline, candidate, {
    minPassRateDelta: 0,
    minTokenDelta: 50,
    minLatencyDeltaMs: 200,
  })
  expect(decision.promote).toBe(true)
  expect(decision.reason).toBe('aggregate_token_reduced')
})

test('aggregate decision rejects pass rate regression', () => {
  const decision = decideAggregatePromotion(
    {
      weightedPassRate: 0.95,
      weightedUsageTotal: 1000,
      weightedLlmElapsedMs: 1000,
    },
    {
      weightedPassRate: 0.9,
      weightedUsageTotal: 800,
      weightedLlmElapsedMs: 500,
    },
    {
      minPassRateDelta: 0,
      minTokenDelta: 1,
      minLatencyDeltaMs: 1,
    },
  )
  expect(decision.promote).toBe(false)
  expect(decision.reason).toBe('aggregate_pass_rate_regressed')
})
