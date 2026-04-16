import { expect, test } from 'vitest'

import {
  buildTaskContractFromDraft,
  resolveWorkerPromptFromDraft,
} from '../src/policy/manager/task-contract.js'

import type { ManagerTaskDraft } from '../src/policy/manager/manager-turn-schema.js'

const buildDraft = (
  overrides: Partial<ManagerTaskDraft> = {},
): ManagerTaskDraft => ({
  title: 'Task with generated prompt',
  cwd: '/tmp/task-with-contract',
  mode: 'write',
  use_worktree: false,
  goal: 'Finish task',
  in_scope: ['Single deliverable'],
  out_of_scope: ['Do not change unrelated modules'],
  done_when: ['Output exists', 'Tests pass'],
  context_refs: ['docs/design/workflow/interfaces-and-state.md'],
  instructions: [],
  ...overrides,
})

test('task contract helpers reject oversized drafts instead of repairing them', () => {
  const draft = buildDraft({
    goal: 'g'.repeat(241),
  })

  expect(buildTaskContractFromDraft(draft)).toBeUndefined()
  expect(resolveWorkerPromptFromDraft(draft)).toBeUndefined()
})

test('task contract helpers reject over-limit list counts instead of trimming them', () => {
  const draft = buildDraft({
    in_scope: [
      'scope-1',
      'scope-2',
      'scope-3',
      'scope-4',
      'scope-5',
      'scope-6',
    ],
    done_when: ['done-1', 'done-2', 'done-3', 'done-4', 'done-5', 'done-6'],
    context_refs: ['a', 'b', 'c', 'd', 'e', 'f'],
    instructions: ['i-1', 'i-2', 'i-3', 'i-4'],
  })

  expect(buildTaskContractFromDraft(draft)).toBeUndefined()
  expect(resolveWorkerPromptFromDraft(draft)).toBeUndefined()
})
