import { mkdir } from 'node:fs/promises'

import { expect, test } from 'vitest'

import { applyTaskActions } from '../src/policy/manager/action-apply.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'

const buildScheduledTask = (cwd: string) => ({
  title: 'scheduled title',
  cwd,
  mode: 'write' as const,
  goal: 'Deliver requested outcome',
  in_scope: ['Single runnable worker task'],
  out_of_scope: [],
  done_when: ['Return concrete output'],
  context_refs: [],
  instructions: ['deliver scheduled work'],
})

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.config.codex.enabled = true
  return runtime
}

test('enqueue_task still auto-links the unique triggered plan whose task template title matches even when plan titles differ', async () => {
  const runtime = await createRuntime()
  const taskCwd = `${runtime.config.workDir}/manager-plan-progress-task-template-match`
  await mkdir(taskCwd, { recursive: true })
  runtime.domain.taskPlans.push(
    {
      id: 'plan-triggered-task-template-match',
      title: 'Auth hardening batch',
      focusId: 'focus-inbox',
      priority: 'normal',
      status: 'active',
      trigger: {
        mode: 'scheduled_at',
        scheduledAt: '2026-02-13T00:00:00.000Z',
      },
      effect: {
        kind: 'enqueue_task',
        taskKey: 'task-key-triggered-task-template-match',
        taskTemplate: {
          title: 'auth guard tightening',
          executionSpecId: 'spec-triggered-task-template-match',
          cwd: taskCwd,
          resourceMode: 'write',
        },
      },
      createdAt: '2026-02-13T00:00:00.000Z',
      updatedAt: '2026-02-13T00:00:00.000Z',
      runtime: {
        runCount: 1,
      },
    },
    {
      id: 'plan-triggered-task-template-match-other',
      title: 'Billing retry overhaul',
      focusId: 'focus-inbox',
      priority: 'normal',
      status: 'active',
      trigger: {
        mode: 'scheduled_at',
        scheduledAt: '2026-02-13T00:00:00.000Z',
      },
      effect: {
        kind: 'enqueue_task',
        taskKey: 'task-key-triggered-task-template-match-other',
        taskTemplate: {
          title: 'billing retry overhaul',
          executionSpecId: 'spec-triggered-task-template-match-other',
          cwd: taskCwd,
          resourceMode: 'write',
        },
      },
      createdAt: '2026-02-13T00:00:00.000Z',
      updatedAt: '2026-02-13T00:00:00.000Z',
      runtime: {
        runCount: 1,
      },
    },
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
