import { mkdir } from 'node:fs/promises'

import { expect, test } from 'vitest'

import { applyTaskActions } from '../src/policy/manager/action-apply.js'
import { applyPlanCompletionState } from '../src/policy/manager/plan-progress.js'
import { GLOBAL_FOCUS_ID } from '../src/work/focus/constants.js'

import {
  buildScheduledTask,
  createPlanProgressRuntime,
  createTriggeredEnqueuePlan,
} from './helpers/manager-plan-progress.js'

test('enqueue_task auto-links a triggered plan to the created task', async () => {
  const runtime = await createPlanProgressRuntime()
  const taskCwd = `${runtime.config.workDir}/manager-plan-progress-task`
  await mkdir(taskCwd, { recursive: true })
  runtime.domain.taskPlans.push(
    createTriggeredEnqueuePlan({
      id: 'plan-triggered',
      title: 'scheduled title',
      cwd: taskCwd,
      focusId: GLOBAL_FOCUS_ID,
      taskKey: 'task-key-triggered',
      executionSpecId: 'spec-triggered',
    }),
  )

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
  const runtime = await createPlanProgressRuntime()
  runtime.domain.taskPlans.push(
    createTriggeredEnqueuePlan({
      id: 'plan-stage-digest',
      title: 'auth guard stage digest',
      cwd: '/repo/auth-guard',
      focusId: GLOBAL_FOCUS_ID,
      taskKey: 'task-key-stage-digest',
      executionSpecId: 'spec-stage-digest',
      taskTemplateTitle: 'auth guard stage digest task',
      trigger: {
        mode: 'on_worker_slot_freed',
      },
      createdAt: '2026-04-02T00:00:00.000Z',
      runtime: {
        runCount: 1,
        lastTaskId: 'task-stage-digest',
      },
    }),
  )

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
      stopReason: 'completed',
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
  const runtime = await createPlanProgressRuntime()
  runtime.domain.taskPlans.push(
    createTriggeredEnqueuePlan({
      id: 'plan-stage-digest-fallback',
      title: 'auth guard stage digest fallback',
      cwd: '/repo/auth-guard',
      focusId: GLOBAL_FOCUS_ID,
      taskKey: 'task-key-stage-digest-fallback',
      executionSpecId: 'spec-stage-digest-fallback',
      taskTemplateTitle: 'auth guard stage digest fallback task',
      trigger: {
        mode: 'on_worker_slot_freed',
      },
      createdAt: '2026-04-02T00:00:00.000Z',
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
    }),
  )

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
