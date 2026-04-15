import { mkdir } from 'node:fs/promises'

import { expect, test } from 'vitest'

import { applyTaskActions } from '../src/policy/manager/action-apply.js'

import {
  buildScheduledTask,
  createPlanProgressRuntime,
  createTriggeredEnqueuePlan,
} from './helpers/manager-plan-progress.js'

test('enqueue_task still auto-links the unique triggered plan whose task template title matches even when plan titles differ', async () => {
  const runtime = await createPlanProgressRuntime()
  const taskCwd = `${runtime.config.workDir}/manager-plan-progress-task-template-match`
  await mkdir(taskCwd, { recursive: true })
  runtime.domain.taskPlans.push(
    createTriggeredEnqueuePlan({
      id: 'plan-triggered-task-template-match',
      title: 'Auth hardening batch',
      cwd: taskCwd,
      taskKey: 'task-key-triggered-task-template-match',
      executionSpecId: 'spec-triggered-task-template-match',
      taskTemplateTitle: 'auth guard tightening',
    }),
    createTriggeredEnqueuePlan({
      id: 'plan-triggered-task-template-match-other',
      title: 'Billing retry overhaul',
      cwd: taskCwd,
      taskKey: 'task-key-triggered-task-template-match-other',
      executionSpecId: 'spec-triggered-task-template-match-other',
      taskTemplateTitle: 'billing retry overhaul',
    }),
  )

  await applyTaskActions(
    runtime,
    [
      {
        type: 'enqueue_task',
        task: {
          ...buildScheduledTask(taskCwd),
          title: 'auth guard tightening',
        },
      },
    ],
    {
      triggeredPlanIds: new Set([
        'plan-triggered-task-template-match',
        'plan-triggered-task-template-match-other',
      ]),
    },
  )

  expect(runtime.domain.tasks).toHaveLength(1)
  expect(runtime.domain.taskPlans[0]?.runtime.lastTaskId).toBe(
    runtime.domain.tasks[0]?.id,
  )
  expect(runtime.domain.taskPlans[1]?.runtime.lastTaskId).toBeUndefined()
})
