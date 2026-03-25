import { expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../../src/work/focus/constants.js'
import { applyTaskActions } from '../../src/policy/manager/action-apply.js'
import { readTaskExecutionSpec } from '../../src/work/spec/store.js'

import { createRuntime, TASK_CWD } from './testkit.js'

import type { TaskPlan } from '../../src/foundation/types/index.js'

test('create_plan uses worker profile for cron plan', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      name: 'create_plan',
      attrs: {
        title: 'scheduled',
        schedule_type: 'cron',
        cron_expr: '0 0 9 * * *',
        time_zone: 'Asia/Shanghai',
        effect_kind: 'enqueue_task',
        task_title: 'scheduled task',
        task_cwd: TASK_CWD,
        task_goal: 'Summarize daily build status',
        task_in_scope: 'Review the latest build state and produce a summary',
        task_done_when_1: 'A concise build status summary is ready',
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
  })
  const effect = runtime.taskPlans[0]?.effect
  expect(effect?.kind).toBe('enqueue_task')
  if (effect?.kind !== 'enqueue_task') throw new Error('expected enqueue effect')
  const spec = await readTaskExecutionSpec(
    runtime.config.workDir,
    effect.taskTemplate.executionSpecId,
  )
  expect(spec.contract?.goal).toBe('Summarize daily build status')
})

test('create_plan accepts on_worker_slot_freed trigger mode', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      name: 'create_plan',
      attrs: {
        title: 'capacity trigger',
        schedule_type: 'on_worker_slot_freed',
        effect_kind: 'wake_manager',
        effect_reason: 'capacity_retry',
      },
    },
  ])

  expect(runtime.taskPlans).toHaveLength(1)
  expect(runtime.taskPlans[0]?.trigger.mode).toBe('on_worker_slot_freed')
  expect(runtime.taskPlans[0]?.effect).toEqual({
    kind: 'wake_manager',
    reason: 'capacity_retry',
  })
})

test('update_plan marks manual close as canceled', async () => {
  const runtime = await createRuntime()
  const activePlan: TaskPlan = {
    id: 'plan-active',
    title: 'active',
    focusId: GLOBAL_FOCUS_ID,
    priority: 'normal',
    status: 'active',
    trigger: {
      mode: 'on_worker_slot_freed',
    },
    effect: {
      kind: 'wake_manager',
      reason: 'capacity_retry',
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
      name: 'update_plan',
      attrs: {
        id: 'plan-active',
        status: 'done',
      },
    },
  ])

  expect(runtime.taskPlans).toHaveLength(1)
  expect(runtime.taskPlans[0]?.status).toBe('done')
  expect(runtime.taskPlans[0]?.runtime.doneReason).toBe('canceled')
  expect(runtime.taskPlans[0]?.runtime.closedAt).toBeTypeOf('string')
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
      kind: 'wake_manager',
      reason: 'capacity_retry',
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
      name: 'delete_plan',
      attrs: {
        id: 'plan-delete',
      },
    },
  ])

  expect(runtime.taskPlans).toHaveLength(1)
  expect(runtime.taskPlans[0]?.status).toBe('done')
  expect(runtime.taskPlans[0]?.runtime.doneReason).toBe('canceled')
})

test('update_plan can switch wake_manager effect into enqueue_task', async () => {
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
      kind: 'wake_manager',
      reason: 'capacity_retry',
    },
    createdAt: '2026-02-13T00:00:00.000Z',
    updatedAt: '2026-02-13T00:00:00.000Z',
    runtime: {
      runCount: 0,
    },
  })

  await applyTaskActions(runtime, [
    {
      name: 'update_plan',
      attrs: {
        id: 'plan-switch-effect',
        effect_kind: 'enqueue_task',
        task_title: 'scheduled task',
        task_cwd: TASK_CWD,
        task_goal: 'Summarize daily build status',
        task_in_scope: 'Review the latest build state and produce a summary',
        task_done_when_1: 'A concise build status summary is ready',
      },
    },
  ])

  const effect = runtime.taskPlans[0]?.effect
  expect(effect?.kind).toBe('enqueue_task')
  if (effect?.kind !== 'enqueue_task') throw new Error('expected enqueue effect')
  const spec = await readTaskExecutionSpec(
    runtime.config.workDir,
    effect.taskTemplate.executionSpecId,
  )
  expect(spec.contract?.goal).toBe('Summarize daily build status')
  expect(effect.taskTemplate.cwd).toBe(TASK_CWD)
})
