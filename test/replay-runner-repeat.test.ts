import { expect, test } from 'vitest'

import { runReplaySuite } from '../src/eval/replay-runner.js'

import type { ReplaySuite } from '../src/eval/replay-types.js'

const suiteWithRepeat: ReplaySuite = {
  suite: 'repeat-suite',
  version: 1,
  cases: [
    {
      id: 'c',
      history: [],
      inputs: [
        {
          id: 'u-1',
          text: 'x',
          createdAt: '2026-02-07T00:00:00.000Z',
        },
      ],
      tasks: [],
      results: [],
      repeat: { count: 3, idFormat: 'c-{i}' },
      expect: {
        output: {
          mustContain: ['ok'],
        },
      },
    },
  ],
}

test('runReplaySuite expands repeat cases and keeps metrics', async () => {
  const report = await runReplaySuite({
    suite: suiteWithRepeat,
    stateDir: process.cwd(),
    workDir: process.cwd(),
    timeoutMs: 50,
    offline: true,
    maxFail: Number.MAX_SAFE_INTEGER,
  })

  expect(report.total).toBe(3)
  expect(report.cases.map((item) => item.id)).toEqual(['c-1', 'c-2', 'c-3'])
  expect(report.metrics.llmCalls).toBe(0)
})
