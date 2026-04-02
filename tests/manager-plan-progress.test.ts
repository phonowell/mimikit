import { mkdir } from 'node:fs/promises'

import { expect, test } from 'vitest'

import { applyTaskActions } from '../src/policy/manager/action-apply.js'
import { GLOBAL_FOCUS_ID } from '../src/work/focus/constants.js'

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

test('enqueue_task auto-links a triggered plan to the created task', async () => {
  const runtime = await createRuntime()
  const taskCwd = `${runtime.config.workDir}/manager-plan-progress-task`
  await mkdir(taskCwd, { recursive: true })
  runtime.domain.taskPlans.push({
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
      taskKey: 'task-key-triggered',
      taskTemplate: {
        title: 'scheduled title',
        executionSpecId: 'spec-triggered',
        cwd: taskCwd,
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
        task: buildScheduledTask(taskCwd),
      },
    ],
    {
      triggeredPlanIds: new Set(['plan-triggered']),
    },
  )

  expect(runtime.domain.tasks).toHaveLength(1)
  expect(runtime.domain.taskPlans[0]?.runtime.lastTaskId).toBe(
    runtime.domain.tasks[0]?.id,
  )
})
