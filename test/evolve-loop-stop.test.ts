import { expect, test } from 'vitest'

import {
  buildPromotionPolicy,
  isRoundImprovement,
} from '../src/evolve/loop-stop.js'

test('improvement prefers pass rate', () => {
  const improved = isRoundImprovement(
    { passRate: 0.9, usageTotal: 1000, llmElapsedMs: 500 },
    { passRate: 1, usageTotal: 2000, llmElapsedMs: 800 },
  )
  expect(improved).toBe(true)
})

test('improvement falls back to token then latency', () => {
  const byToken = isRoundImprovement(
    { passRate: 1, usageTotal: 1000, llmElapsedMs: 500 },
    { passRate: 1, usageTotal: 900, llmElapsedMs: 900 },
  )
  expect(byToken).toBe(true)

  const byLatency = isRoundImprovement(
    { passRate: 1, usageTotal: 1000, llmElapsedMs: 500 },
    { passRate: 1, usageTotal: 1000, llmElapsedMs: 490 },
  )
  expect(byLatency).toBe(false)

  const noGain = isRoundImprovement(
    { passRate: 1, usageTotal: 1000, llmElapsedMs: 500 },
    { passRate: 1, usageTotal: 1000, llmElapsedMs: 500 },
  )
  expect(noGain).toBe(false)
})

test('custom policy thresholds are respected', () => {
  const byLatency = isRoundImprovement(
    { passRate: 1, usageTotal: 1000, llmElapsedMs: 500 },
    { passRate: 1, usageTotal: 1000, llmElapsedMs: 490 },
    buildPromotionPolicy({ minLatencyDeltaMs: 5 }),
  )
  expect(byLatency).toBe(true)
})
