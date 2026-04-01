import { expect, test } from 'vitest'

import {
  buildPlansPromptPayload,
  buildTasksPromptPayload,
} from '../src/foundation/prompting/format.js'

import {
  createPlanFixture,
  createTaskFixture,
} from './helpers/runtime-snapshot.js'

test('buildTasksPromptPayload keeps unrelated closed tasks expanded after input-side rollback', () => {
  const activeTask = createTaskFixture({
    id: 'task-focus-active',
    focusId: 'focus-current',
    status: 'running',
    contract: {
      goal: 'Keep current focus task expanded',
      scope: 'Preserve task contract for active work',
      acceptance: ['manager sees active task contract'],
    },
  })
  const unrelatedClosedTask = createTaskFixture({
    id: 'task-closed-other',
    focusId: 'focus-other',
    status: 'succeeded',
    completedAt: '2026-03-20T12:35:00.000Z',
    contract: {
      goal: 'Legacy closed task',
      scope: 'Should collapse to card',
      acceptance: ['contract omitted from card'],
    },
  })

  const payload = buildTasksPromptPayload(
    [activeTask, unrelatedClosedTask],
    [],
    '/tmp',
    {
      workingFocusIds: ['focus-current'],
    },
  )

  const taskById = Object.fromEntries(
    (payload?.tasks ?? []).map((task) => [String(task.id), task]),
  )

  expect(taskById['task-focus-active']).toMatchObject({
    id: 'task-focus-active',
    contract: {
      goal: 'Keep current focus task expanded',
    },
  })
  expect(taskById['task-closed-other']).toMatchObject({
    id: 'task-closed-other',
    status: 'succeeded',
    title: 'Check',
    contract: {
      goal: 'Legacy closed task',
    },
  })
})

test('buildPlansPromptPayload keeps unrelated done plans expanded after input-side rollback', () => {
  const activePlan = createPlanFixture({
    id: 'plan-focus-active',
    focusId: 'focus-current',
    status: 'active',
    effect: {
      kind: 'enqueue_task',
      taskKey: 'plan-task-key-focus-active',
      taskContract: {
        goal: 'Keep focused plan expanded',
        scope: 'Preserve task contract for current focus',
        acceptance: ['manager sees focused plan contract'],
      },
      taskTemplate: {
        title: 'Active plan task',
        executionSpecId: 'spec-plan-focus-active',
        cwd: '/tmp/runtime-snapshot-plan-task',
        resourceMode: 'write',
      },
    },
  })
  const donePlan = createPlanFixture({
    id: 'plan-done-other',
    focusId: 'focus-other',
    status: 'done',
    runtime: {
      runCount: 1,
      closedAt: '2026-03-20T13:00:00.000Z',
      doneReason: 'completed',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'plan-task-key-done-other',
      taskContract: {
        goal: 'Closed plan task contract',
        scope: 'Should collapse to card',
        acceptance: ['task contract omitted from card'],
      },
      taskTemplate: {
        title: 'Done plan task',
        executionSpecId: 'spec-plan-done-other',
        cwd: '/tmp/runtime-snapshot-plan-task',
        resourceMode: 'write',
      },
    },
  })

  const payload = buildPlansPromptPayload([activePlan, donePlan], {
    workingFocusIds: ['focus-current'],
  })

  expect(payload?.plans[0]).toMatchObject({
    id: 'plan-focus-active',
    task_contract: {
      goal: 'Keep focused plan expanded',
    },
  })
  expect(payload?.plans[1]).toMatchObject({
    id: 'plan-done-other',
    status: 'done',
    done_reason: 'completed',
    task_contract: {
      goal: 'Closed plan task contract',
    },
  })
})
