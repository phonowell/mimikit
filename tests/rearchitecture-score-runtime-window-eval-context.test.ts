import { expect, test } from 'vitest'

import { evaluateContextScore } from '../scripts/rearchitecture/score-runtime-window-eval-context.js'

test('evaluateContextScore marks incomplete promptSectionLimits as drift', () => {
  const score = evaluateContextScore({
    logs: [
      {
        time: '2026-03-08T00:00:20.500Z',
        event: 'manager_context_budget_resolved',
        policy: 'fixed',
        wakeProfile: 'user_input',
        inputCount: 1,
        resultCount: 0,
        activeFocusCount: 1,
        promptSectionLimits: {
          batchResultsMaxBytes: 8192,
        },
      },
    ],
  })

  expect(score.budgetRows).toHaveLength(1)
  expect(score.driftRounds).toBe(1)
})

test('evaluateContextScore ignores retired detail-recall events', () => {
  const score = evaluateContextScore({
    logs: [
      {
        time: '2026-03-08T00:00:20.500Z',
        event: 'manager_query_context',
        resultScopeCount: 3,
      },
      {
        time: '2026-03-08T00:00:21.500Z',
        event: 'manager_read_file',
        status: 'ok',
      },
    ],
  })

  expect(score.detailRecallTotal).toBe(0)
  expect(score.detailRecallSuccess).toBe(0)
  expect(score.contextWasteCount).toBe(0)
})
