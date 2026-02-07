import { expect, test } from 'vitest'

import { decidePromptPromotion } from '../src/evolve/decision.js'

import type { ReplayReport } from '../src/eval/replay-types.js'

const makeReport = (params: {
  passRate: number
  usageTotal: number
  llmElapsedMs: number
}): ReplayReport => ({
  suite: 'x',
  version: 1,
  runAt: '2026-02-07T00:00:00.000Z',
  total: 1,
  passed: params.passRate >= 1 ? 1 : 0,
  failed: params.passRate >= 1 ? 0 : 1,
  passRate: params.passRate,
  stoppedEarly: false,
  maxFail: 1,
  metrics: {
    llmCalls: 1,
    liveCases: 1,
    archiveCases: 0,
    llmElapsedMs: params.llmElapsedMs,
    usage: {
      input: params.usageTotal,
      output: 0,
      total: params.usageTotal,
    },
  },
  cases: [
    {
      id: 'c1',
      status: params.passRate >= 1 ? 'passed' : 'failed',
      source: 'live',
      elapsedMs: params.llmElapsedMs,
      llmElapsedMs: params.llmElapsedMs,
      usage: { input: params.usageTotal, output: 0, total: params.usageTotal },
      outputChars: 1,
      commandStats: {},
      assertions: [],
    },
  ],
})

test('promotes when pass rate improves', () => {
  const baseline = makeReport({ passRate: 0, usageTotal: 1000, llmElapsedMs: 100 })
  const candidate = makeReport({ passRate: 1, usageTotal: 2000, llmElapsedMs: 200 })
  const decision = decidePromptPromotion(baseline, candidate)
  expect(decision.promote).toBe(true)
  expect(decision.reason).toBe('pass_rate_improved')
})

test('rejects when pass rate regresses', () => {
  const baseline = makeReport({ passRate: 1, usageTotal: 1000, llmElapsedMs: 100 })
  const candidate = makeReport({ passRate: 0, usageTotal: 10, llmElapsedMs: 1 })
  const decision = decidePromptPromotion(baseline, candidate)
  expect(decision.promote).toBe(false)
  expect(decision.reason).toBe('pass_rate_regressed')
})

test('uses token and latency tiebreakers', () => {
  const baseline = makeReport({ passRate: 1, usageTotal: 1000, llmElapsedMs: 500 })
  const candidateBetterToken = makeReport({
    passRate: 1,
    usageTotal: 900,
    llmElapsedMs: 800,
  })
  const tokenDecision = decidePromptPromotion(baseline, candidateBetterToken)
  expect(tokenDecision.promote).toBe(true)
  expect(tokenDecision.reason).toBe('token_total_reduced')

  const candidateBetterLatency = makeReport({
    passRate: 1,
    usageTotal: 1000,
    llmElapsedMs: 400,
  })
  const latencyDecision = decidePromptPromotion(baseline, candidateBetterLatency)
  expect(latencyDecision.promote).toBe(true)
  expect(latencyDecision.reason).toBe('llm_elapsed_reduced')
})
