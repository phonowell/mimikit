import { expect, test } from 'vitest'

import { parseManagerTurn } from '../src/policy/manager/manager-turn.js'

test('parseManagerTurn keeps structured decision metadata as-is', () => {
  const parsed = parseManagerTurn({
    reply: '当前证据冲突，需要你拍板。',
    actions: [],
    decision: {
      mode: 'escalate',
      reason: 'evidence_conflict',
    },
  })

  expect(parsed.decision).toEqual({
    mode: 'escalate',
    reason: 'evidence_conflict',
  })
})

test('parseManagerTurn rejects handoff decision without structured reason', () => {
  expect(() =>
    parseManagerTurn({
      reply: '先停在 handoff。',
      actions: [],
      decision: {
        mode: 'handoff',
      },
    }),
  ).toThrow(/reason/i)
})
