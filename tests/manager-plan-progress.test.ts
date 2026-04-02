import { mkdir } from 'node:fs/promises'

import { expect, test } from 'vitest'

import { applyTaskActions } from '../src/policy/manager/action-apply.js'
import { applyPlanCompletionState } from '../src/policy/manager/plan-progress.js'
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

test('applyPlanCompletionState writes stage digest from the latest anchored task result', async () => {
  const runtime = await createRuntime()
  runtime.domain.taskPlans.push({
    id: 'plan-stage-digest',
    title: 'auth guard stage digest',
    focusId: GLOBAL_FOCUS_ID,
    priority: 'normal',
    status: 'active',
    trigger: {
      mode: 'on_worker_slot_freed',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-stage-digest',
      taskTemplate: {
        title: 'auth guard stage digest task',
        executionSpecId: 'spec-stage-digest',
        cwd: '/repo/auth-guard',
        resourceMode: 'write',
      },
    },
    createdAt: '2026-04-02T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z',
    runtime: {
      runCount: 1,
      lastTaskId: 'task-stage-digest',
    },
  })

  applyPlanCompletionState(runtime, [
    {
      taskId: 'task-stage-digest',
      status: 'succeeded',
      ok: true,
      output: '当前阶段已经完成。',
      completedAt: '2026-04-02T00:10:00.000Z',
      durationMs: 15,
      handoff: {
        summary: 'auth guard 当前阶段已完成，已进入下一步落地准备。',
        risks: ['剩余风险是回归验证还未跑完。'],
      },
      stopReason: 'closure_pending',
    },
  ])

  expect(runtime.domain.taskPlans[0]?.runtime.stage).toEqual({
    summary: 'auth guard 当前阶段已完成，已进入下一步落地准备。',
    risk: '剩余风险是回归验证还未跑完。',
    needsDecision: false,
    sourceTaskId: 'task-stage-digest',
    updatedAt: '2026-04-02T00:10:00.000Z',
  })
})

test('applyPlanCompletionState refreshes stage digest even when the latest anchored result has no handoff summary or risk text', async () => {
  const runtime = await createRuntime()
  runtime.domain.taskPlans.push({
    id: 'plan-stage-digest-fallback',
    title: 'auth guard stage digest fallback',
    focusId: GLOBAL_FOCUS_ID,
    priority: 'normal',
    status: 'active',
    trigger: {
      mode: 'on_worker_slot_freed',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-stage-digest-fallback',
      taskTemplate: {
        title: 'auth guard stage digest fallback task',
        executionSpecId: 'spec-stage-digest-fallback',
        cwd: '/repo/auth-guard',
        resourceMode: 'write',
      },
    },
    createdAt: '2026-04-02T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z',
    runtime: {
      runCount: 1,
      lastTaskId: 'task-stage-digest-fallback',
      stage: {
        summary: '旧阶段摘要',
        risk: '旧风险',
        needsDecision: false,
        sourceTaskId: 'task-stage-digest-old',
        updatedAt: '2026-04-02T00:05:00.000Z',
      },
    },
  })

  applyPlanCompletionState(runtime, [
    {
      taskId: 'task-stage-digest-fallback',
      status: 'succeeded',
      ok: true,
      output: '',
      completedAt: '2026-04-02T00:10:00.000Z',
      durationMs: 15,
      handoff: {},
      stopReason: 'completed',
    },
  ])

  expect(runtime.domain.taskPlans[0]?.runtime.stage).toEqual({
    summary: 'Task "task-stage-digest-fallback" completed.',
    needsDecision: false,
    sourceTaskId: 'task-stage-digest-fallback',
    updatedAt: '2026-04-02T00:10:00.000Z',
  })
})
