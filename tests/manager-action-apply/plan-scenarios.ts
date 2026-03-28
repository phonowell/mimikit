import { expect, test } from 'vitest'

import { applyTaskActions } from '../../src/policy/manager/action-apply.js'
import { GLOBAL_FOCUS_ID } from '../../src/work/focus/constants.js'
import { readTaskExecutionSpec } from '../../src/work/spec/store.js'

import { buildTaskDraft, createRuntime, TASK_CWD } from './testkit.js'

import type { TaskPlan } from '../../src/foundation/types/index.js'

test('set_plan creates cron plan with enqueue_task effect', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      type: 'set_plan',
      plan_id: null,
      plan: {
        title: 'scheduled',
        trigger: {
          type: 'cron',
          cron: '0 0 9 * * *',
          time_zone: 'Asia/Shanghai',
        },
        task: buildTaskDraft({
          title: 'scheduled task',
          goal: 'Summarize daily build status',
          in_scope: ['Review the latest build state and produce a summary'],
          done_when: ['A concise build status summary is ready'],
        }),
        priority: 'normal',
        max_runs: 5,
      },
    },
  ])

  expect(runtime.taskPlans).toHaveLength(1)
  expect(runtime.taskPlans[0]?.trigger.mode).toBe('cron')
  expect(runtime.taskPlans[0]?.trigger).toMatchObject({
    timeZone: 'Asia/Shanghai',
  })
  expect(runtime.taskPlans[0]?.effect).toMatchObject({
    kind: 'enqueue_task',
    taskTemplate: {
      title: 'scheduled task',
      cwd: TASK_CWD,
    },
    taskContract: {
      goal: 'Summarize daily build status',
      scope: 'Review the latest build state and produce a summary',
      acceptance: ['A concise build status summary is ready'],
    },
  })
  const effect = runtime.taskPlans[0]?.effect
  expect(effect?.kind).toBe('enqueue_task')
  if (effect?.kind !== 'enqueue_task')
    throw new Error('expected enqueue effect')
  expect(effect.taskTemplate).not.toHaveProperty('contract')
  expect(effect.taskTemplate).not.toHaveProperty('fingerprint')
  expect(effect.taskTemplate).not.toHaveProperty('semanticKey')
  expect(effect.taskKey).toBeTruthy()
  const spec = await readTaskExecutionSpec(
    runtime.config.workDir,
    effect.taskTemplate.executionSpecId,
  )
  expect(spec.contract?.goal).toBe('Summarize daily build status')
})

test('set_plan accepts on_worker_slot_freed trigger mode', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      type: 'set_plan',
      plan_id: null,
      plan: {
        title: 'capacity trigger',
        trigger: {
          type: 'on_worker_slot_freed',
        },
        task: buildTaskDraft({
          title: 'capacity task',
        }),
        priority: 'normal',
        max_runs: null,
      },
    },
  ])

  expect(runtime.taskPlans).toHaveLength(1)
  expect(runtime.taskPlans[0]?.trigger.mode).toBe('on_worker_slot_freed')
  expect(runtime.taskPlans[0]?.effect.kind).toBe('enqueue_task')
})

test('delete_plan keeps plan entity and records canceled closure', async () => {
  const runtime = await createRuntime()
  const activePlan: TaskPlan = {
    id: 'plan-delete',
    title: 'delete target',
    focusId: GLOBAL_FOCUS_ID,
    priority: 'normal',
    status: 'active',
    trigger: {
      mode: 'on_worker_slot_freed',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-delete',
      taskTemplate: {
        title: 'capacity task',
        executionSpecId: 'spec-delete',
        cwd: TASK_CWD,
        resourceMode: 'write',
      },
    },
    createdAt: '2026-02-13T00:00:00.000Z',
    updatedAt: '2026-02-13T00:00:00.000Z',
    runtime: {
      runCount: 0,
    },
  }
  runtime.taskPlans.push(activePlan)

  await applyTaskActions(runtime, [
    {
      type: 'delete_plan',
      plan_id: 'plan-delete',
    },
  ])

  expect(runtime.taskPlans).toHaveLength(1)
  expect(runtime.taskPlans[0]?.status).toBe('done')
  expect(runtime.taskPlans[0]?.runtime.doneReason).toBe('canceled')
})

test('set_plan replaces active plan in place', async () => {
  const runtime = await createRuntime()
  runtime.taskPlans.push({
    id: 'plan-switch-effect',
    title: 'switch effect',
    focusId: GLOBAL_FOCUS_ID,
    priority: 'normal',
    status: 'active',
    trigger: {
      mode: 'on_worker_slot_freed',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-old',
      taskTemplate: {
        title: 'old scheduled task',
        executionSpecId: 'spec-old',
        cwd: TASK_CWD,
        resourceMode: 'write',
      },
    },
    createdAt: '2026-02-13T00:00:00.000Z',
    updatedAt: '2026-02-13T00:00:00.000Z',
    runtime: {
      runCount: 0,
    },
  })

  await applyTaskActions(runtime, [
    {
      type: 'set_plan',
      plan_id: 'plan-switch-effect',
      plan: {
        title: 'switch effect',
        trigger: {
          type: 'on_worker_slot_freed',
        },
        task: buildTaskDraft({
          title: 'scheduled task',
          goal: 'Summarize daily build status',
          in_scope: ['Review the latest build state and produce a summary'],
          done_when: ['A concise build status summary is ready'],
        }),
        priority: 'normal',
        max_runs: null,
      },
    },
  ])

  const effect = runtime.taskPlans[0]?.effect
  expect(effect?.kind).toBe('enqueue_task')
  if (effect?.kind !== 'enqueue_task')
    throw new Error('expected enqueue effect')
  expect(effect.taskTemplate).not.toHaveProperty('semanticKey')
  const spec = await readTaskExecutionSpec(
    runtime.config.workDir,
    effect.taskTemplate.executionSpecId,
  )
  expect(spec.contract?.goal).toBe('Summarize daily build status')
  expect(effect.taskTemplate.cwd).toBe(TASK_CWD)
})
