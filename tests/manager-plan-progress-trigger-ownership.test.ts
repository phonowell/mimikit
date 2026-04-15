import { mkdir } from 'node:fs/promises'

import { expect, test } from 'vitest'

import { applyTaskActions } from '../src/policy/manager/action-apply.js'

import {
  buildScheduledTask,
  createPlanProgressRuntime,
  createTriggeredEnqueuePlan,
} from './helpers/manager-plan-progress.js'

test('enqueue_task does not auto-link the sole triggered plan when the created task belongs to a different focus and semantics', async () => {
  const runtime = await createPlanProgressRuntime()
  const taskCwd = `${runtime.config.workDir}/manager-plan-progress-task-mismatch`
  await mkdir(taskCwd, { recursive: true })
  runtime.domain.taskPlans.push(
    createTriggeredEnqueuePlan({
      id: 'plan-triggered-mismatch',
      title: 'auth guard follow-up',
      cwd: taskCwd,
      focusId: 'focus-auth',
      taskKey: 'task-key-triggered-mismatch',
      executionSpecId: 'spec-triggered-mismatch',
    }),
  )

  await applyTaskActions(
    runtime,
    [
      {
        type: 'enqueue_task',
        task: {
          ...buildScheduledTask(taskCwd),
          title: 'billing retry overhaul',
          goal: 'Rebuild billing retry pipeline',
          in_scope: ['Only billing retry pipeline'],
          done_when: ['Billing retry pipeline finished'],
        },
      },
    ],
    {
      triggeredPlanIds: new Set(['plan-triggered-mismatch']),
    },
  )

  expect(runtime.domain.tasks).toHaveLength(1)
  expect(runtime.domain.taskPlans[0]?.runtime.lastTaskId).toBeUndefined()
})

test('enqueue_task does not auto-link a same-focus triggered plan when multiple triggered plans exist but only weak focus ownership matches', async () => {
  const runtime = await createPlanProgressRuntime()
  const taskCwd = `${runtime.config.workDir}/manager-plan-progress-same-focus-mismatch`
  await mkdir(taskCwd, { recursive: true })
  runtime.domain.taskPlans.push(
    createTriggeredEnqueuePlan({
      id: 'plan-triggered-same-focus-mismatch',
      title: 'billing retry overhaul',
      cwd: taskCwd,
      taskKey: 'task-key-triggered-same-focus-mismatch',
      executionSpecId: 'spec-triggered-same-focus-mismatch',
    }),
    createTriggeredEnqueuePlan({
      id: 'plan-triggered-other-focus',
      title: 'auth guard follow-up',
      cwd: taskCwd,
      focusId: 'focus-auth',
      taskKey: 'task-key-triggered-other-focus',
      executionSpecId: 'spec-triggered-other-focus',
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
          goal: 'Tighten auth guard ownership checks',
          in_scope: ['Only auth guard'],
          done_when: ['Auth guard follow-up completed'],
        },
      },
    ],
    {
      triggeredPlanIds: new Set([
        'plan-triggered-same-focus-mismatch',
        'plan-triggered-other-focus',
      ]),
    },
  )

  expect(runtime.domain.tasks).toHaveLength(1)
  expect(runtime.domain.taskPlans[0]?.runtime.lastTaskId).toBeUndefined()
  expect(runtime.domain.taskPlans[1]?.runtime.lastTaskId).toBeUndefined()
})
