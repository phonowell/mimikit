import { expect, test } from 'vitest'

import { buildStructuredTaskHandoff } from '../src/execution/worker/task-handoff-protocol.js'

test('buildStructuredTaskHandoff ignores worker-provided git lifecycle writes', () => {
  const handoff = buildStructuredTaskHandoff({
    git: {
      worktreePath: '/tmp/task-git-handoff',
      branch: 'feature/task-git-handoff',
      closureRequired: true,
      lifecycle: {
        review: { passed: false },
        merged: false,
        cleaned: false,
      },
    },
    handoff: {
      summary: 'done',
      git_lifecycle: {
        review: {
          passed: true,
          at: '2026-03-31T08:00:00.000Z',
          sha: 'abc123',
        },
        merged: true,
        cleaned: true,
      },
    },
  })

  expect(handoff?.git?.lifecycle).toEqual({
    review: { passed: false },
    merged: false,
    cleaned: false,
  })
})

test('buildStructuredTaskHandoff keeps auxiliary fields even when summary is omitted', () => {
  const handoff = buildStructuredTaskHandoff({
    handoff: {
      decisions: ['Enabled feature flag'],
      next_steps: ['Monitor rollout'],
    },
  })

  expect(handoff).toEqual({
    decisions: ['Enabled feature flag'],
    nextSteps: ['Monitor rollout'],
  })
})
