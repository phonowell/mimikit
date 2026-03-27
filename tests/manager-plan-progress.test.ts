import { expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../src/work/focus/constants.js'
import { applyTaskActions } from '../src/policy/manager/action-apply.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'

const TASK_CWD = '/tmp/manager-action-apply-task'

const scheduledTask = {
  title: 'scheduled title',
  cwd: TASK_CWD,
  mode: 'write' as const,
  goal: 'Deliver requested outcome',
  in_scope: ['Single runnable worker task'],
  out_of_scope: [],
  done_when: ['Return concrete output'],
  context_refs: [],
  instructions: ['deliver scheduled work'],
}

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.config.codex.enabled = true
  return runtime
}

test('enqueue_task auto-links a triggered plan to the created task', async () => {
  const runtime = await createRuntime()
  runtime.taskPlans.push({
    id: 'plan-triggered',
    title: 'scheduled title',
    focusId: GLOBAL_FOCUS_ID,
    priority: 'normal',
    status: 'active',
    trigger: {
      mode: 'scheduled_at',
      scheduledAt: '2026-02-13T00:00:00.000Z',
    },
    effect: {
      kind: 'enqueue_task',
      taskTemplate: {
        title: 'scheduled title',
        executionSpecId: 'spec-triggered',
        fingerprint: 'fp-triggered',
        semanticKey: 'sk-triggered',
        cwd: TASK_CWD,
        resourceMode: 'write',
      },
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
        type: 'enqueue_task',
        task: scheduledTask,
      },
    ],
    {
      triggeredPlanIds: new Set(['plan-triggered']),
    },
  )

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.taskPlans[0]?.runtime.lastTaskId).toBe(runtime.tasks[0]?.id)
})
