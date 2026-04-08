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

test('enqueue_task does not auto-link the sole triggered plan when the created task belongs to a different focus and semantics', async () => {
  const runtime = await createRuntime()
  const taskCwd = `${runtime.config.workDir}/manager-plan-progress-task-mismatch`
  await mkdir(taskCwd, { recursive: true })
  runtime.domain.taskPlans.push({
    id: 'plan-triggered-mismatch',
    title: 'auth guard follow-up',
    focusId: 'focus-auth',
    priority: 'normal',
    status: 'active',
    trigger: {
      mode: 'scheduled_at',
      scheduledAt: '2026-02-13T00:00:00.000Z',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-triggered-mismatch',
      taskTemplate: {
        title: 'auth guard follow-up',
        executionSpecId: 'spec-triggered-mismatch',
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
  const runtime = await createRuntime()
  const taskCwd = `${runtime.config.workDir}/manager-plan-progress-same-focus-mismatch`
  await mkdir(taskCwd, { recursive: true })
  runtime.domain.taskPlans.push(
    {
      id: 'plan-triggered-same-focus-mismatch',
      title: 'billing retry overhaul',
      focusId: 'focus-inbox',
      priority: 'normal',
      status: 'active',
      trigger: {
        mode: 'scheduled_at',
        scheduledAt: '2026-02-13T00:00:00.000Z',
      },
      effect: {
        kind: 'enqueue_task',
        taskKey: 'task-key-triggered-same-focus-mismatch',
        taskTemplate: {
          title: 'billing retry overhaul',
          executionSpecId: 'spec-triggered-same-focus-mismatch',
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
      id: 'plan-triggered-other-focus',
      title: 'auth guard follow-up',
      focusId: 'focus-auth',
      priority: 'normal',
      status: 'active',
      trigger: {
        mode: 'scheduled_at',
        scheduledAt: '2026-02-13T00:00:00.000Z',
      },
      effect: {
        kind: 'enqueue_task',
        taskKey: 'task-key-triggered-other-focus',
        taskTemplate: {
          title: 'auth guard follow-up',
          executionSpecId: 'spec-triggered-other-focus',
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
