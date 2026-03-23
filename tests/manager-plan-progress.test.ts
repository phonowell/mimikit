import { expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../src/focus/constants.js'
import { applyTaskActions } from '../src/manager/action-apply.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const CONTRACT_ATTRS = {
  goal: 'Deliver requested outcome',
  in_scope: 'Single runnable worker task',
  done_when_1: 'Return concrete output',
}
const TASK_CWD = '/tmp/manager-action-apply-task'

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.config.codex.enabled = true
  return runtime
}

test('enqueue_task auto-links a triggered plan to the created task', async () => {
  const runtime = await createRuntime()
  runtime.taskPlans.push({
    id: 'plan-triggered',
    prompt: 'scheduled prompt',
    title: 'scheduled title',
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    priority: 'normal',
    source: 'user_request',
    status: 'active',
    trigger: {
      mode: 'scheduled_at',
      scheduledAt: '2026-02-13T00:00:00.000Z',
    },
    createdAt: '2026-02-13T00:00:00.000Z',
    updatedAt: '2026-02-13T00:00:00.000Z',
    runtime: {
      runCount: 1,
    },
  })

  await applyTaskActions(
    runtime,
    [
      {
        name: 'enqueue_task',
        attrs: {
          worker_prompt: 'deliver scheduled work',
          title: 'scheduled title',
          cwd: TASK_CWD,
          ...CONTRACT_ATTRS,
        },
      },
    ],
    {
      triggeredPlanIds: new Set(['plan-triggered']),
    },
  )

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.taskPlans[0]?.runtime.lastTaskId).toBe(runtime.tasks[0]?.id)
})

test('update_plan rejects done plan edits', async () => {
  const runtime = await createRuntime()
  runtime.taskPlans.push({
    id: 'plan-done-bind',
    prompt: 'scheduled prompt',
    title: 'scheduled title',
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    priority: 'normal',
    source: 'user_request',
    status: 'done',
    trigger: {
      mode: 'scheduled_at',
      scheduledAt: '2026-02-13T00:00:00.000Z',
    },
    createdAt: '2026-02-13T00:00:00.000Z',
    updatedAt: '2026-02-13T00:00:00.000Z',
    runtime: {
      runCount: 1,
      closedAt: '2026-02-13T00:00:00.000Z',
      doneReason: 'completed',
    },
  })

  await applyTaskActions(runtime, [
    {
      name: 'update_plan',
      attrs: {
        id: 'plan-done-bind',
        title: 'changed title',
      },
    },
  ])

  expect(runtime.taskPlans[0]?.title).toBe('scheduled title')
})
