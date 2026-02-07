import { expect, test } from 'vitest'

import {
  runSelfEvolveLoop,
  type SelfEvolveLoopResult,
} from '../src/evolve/loop.js'

void runSelfEvolveLoop

test('self evolve loop result shape remains stable', () => {
  const sample: SelfEvolveLoopResult = {
    stoppedReason: 'no_gain',
    rounds: [
      {
        round: 1,
        promote: true,
        reason: 'token_total_reduced',
        baseline: { passRate: 1, usageTotal: 1000, llmElapsedMs: 500 },
        candidate: { passRate: 1, usageTotal: 900, llmElapsedMs: 480 },
        decisionPath: '/tmp/decision.json',
      },
      {
        round: 2,
        promote: false,
        reason: 'no_measurable_gain',
        baseline: { passRate: 1, usageTotal: 900, llmElapsedMs: 480 },
        candidate: { passRate: 1, usageTotal: 900, llmElapsedMs: 480 },
        decisionPath: '/tmp/decision2.json',
      },
    ],
    bestRound: 1,
  }

  expect(sample.stoppedReason).toBe('no_gain')
  expect(sample.rounds.length).toBe(2)
  expect(sample.bestRound).toBe(1)
})
