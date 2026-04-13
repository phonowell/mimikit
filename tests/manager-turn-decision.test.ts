import { expect, test } from 'vitest'

import { parseManagerTurn } from '../src/policy/manager/manager-turn.js'

test('parseManagerTurn rejects removed top-level decision field', () => {
  expect(() =>
    parseManagerTurn({
      reply: '当前证据冲突，需要你拍板。',
      actions: [],
      decision: {
        mode: 'escalate',
        reason: 'evidence_conflict',
      },
    }),
  ).toThrow()
})
