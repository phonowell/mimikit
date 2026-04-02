import { expect, test } from 'vitest'

import { applyTaskActions } from '../src/policy/manager/action-apply.js'

import {
  buildTaskDraft,
  createRuntime,
} from './manager-action-apply/testkit.js'

test('set_plan preserves task use_worktree on enqueue effect', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      type: 'set_plan',
      plan_id: null,
      plan: {
        title: 'scheduled wt',
        trigger: {
          type: 'on_worker_slot_freed',
        },
        task: buildTaskDraft({
          title: 'scheduled wt task',
          use_worktree: true,
        }),
        priority: 'normal',
        max_runs: null,
      },
    },
  ])

  expect(runtime.domain.taskPlans).toHaveLength(1)
  const effect = runtime.domain.taskPlans[0]?.effect
  expect(effect?.kind).toBe('enqueue_task')
  if (effect?.kind !== 'enqueue_task')
    throw new Error('expected enqueue effect')
  expect(effect.taskTemplate.useWorktree).toBe(true)
})
