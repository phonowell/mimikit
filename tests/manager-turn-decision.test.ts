import { expect, test } from 'vitest'

import { parseManagerTurn } from '../src/policy/manager/manager-turn.js'

test('parseManagerTurn ignores removed top-level decision field when reply and actions are valid', () => {
  const parsed = parseManagerTurn({
    reply: '当前证据冲突，需要你拍板。',
    actions: [],
    decision: {
      mode: 'escalate',
      reason: 'evidence_conflict',
    },
  })

  expect(parsed).toEqual({
    reply: '当前证据冲突，需要你拍板。',
    actions: [],
  })
})
