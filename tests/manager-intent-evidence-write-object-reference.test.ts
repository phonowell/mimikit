import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'
import { resolveLowRiskWriteEnqueueContinuation } from '../src/policy/manager/action-intent-evidence-write-target.js'

import {
  createIntentEvidenceTask,
  createIntentEvidenceUserInput as createUserInput,
} from './helpers/manager-intent-evidence.js'
import { createPlanFixture } from './helpers/runtime-snapshot.js'

test('continues on the most likely workline when signals converge', () => {
  const targetPlan = createPlanFixture({
    id: 'plan-auth-guard-converged',
    title: '按整体方案推进登录门禁收尾',
    focusId: 'focus-inbox',
    status: 'active',
    runtime: {
      runCount: 1,
      lastTaskId: 'task-finished-auth-guard-converged',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-auth-guard-converged',
      taskContract: {
        goal: '沿当前鉴权链路补齐入口门禁剩余改造',
        scope: '只处理当前登录门禁主线',
        acceptance: ['入口门禁剩余改造完成'],
      },
      taskTemplate: {
        title: '推进登录门禁收尾',
        executionSpecId: 'spec-auth-guard-converged',
        cwd: '/repo/auth-guard',
        resourceMode: 'write',
        useWorktree: false,
      },
    },
  })
  const otherPlan = createPlanFixture({
    id: 'plan-billing-retry-other',
    title: '推进 billing retry 收尾',
    focusId: 'focus-inbox',
    status: 'active',
    runtime: {
      runCount: 1,
      lastTaskId: 'task-other',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-billing-retry-other',
      taskContract: {
        goal: '收敛 billing retry 剩余回归验证',
        scope: '只处理 billing retry pipeline',
        acceptance: ['billing retry 回归完成'],
      },
      taskTemplate: {
        title: '推进 billing retry 收尾',
        executionSpecId: 'spec-billing-retry-other',
        cwd: '/repo/auth-guard',
        resourceMode: 'write',
        useWorktree: false,
      },
    },
  })

  const result = resolveLowRiskWriteEnqueueContinuation({
    item: {
      type: 'enqueue_task',
      task: {
        title: '补齐入口门禁剩余改造',
        cwd: '/repo/auth-guard',
        mode: 'write',
        use_worktree: false,
        goal: '沿当前鉴权链路继续补实现并完成验收',
        in_scope: ['聚焦登录门禁后续落地'],
        out_of_scope: [],
        done_when: ['当前入口门禁主线收尾完成'],
        context_refs: [],
        instructions: [],
      },
    },
    inputTexts: ['继续把入口门禁这条线收掉，先补完剩余改造。'],
    planById: new Map([
      [targetPlan.id, targetPlan],
      [otherPlan.id, otherPlan],
    ]),
    resultTaskIds: new Set(['task-finished-auth-guard-converged']),
    defaultFocusId: 'focus-inbox',
  })

  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`expected continue, got ${result.reason}`)
  expect(result.mode).toBe('continue')
  expect(result.targetId).toBe(targetPlan.id)
})

test('asks for lightweight confirmation when competing worklines stay ambiguous', () => {
  const firstPlan = createPlanFixture({
    id: 'plan-auth-guard-ambiguous-a',
    title: '继续推进登录门禁后续整改',
    focusId: 'focus-inbox',
    status: 'active',
    runtime: {
      runCount: 1,
      lastTaskId: 'task-finished-auth-guard-ambiguous',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-auth-guard-ambiguous-a',
      taskContract: {
        goal: '沿当前鉴权链路继续推进后续整改',
        scope: '只处理登录门禁主线',
        acceptance: ['当前后续整改完成'],
      },
      taskTemplate: {
        title: '继续推进登录门禁后续整改',
        executionSpecId: 'spec-auth-guard-ambiguous-a',
        cwd: '/repo/auth-guard',
        resourceMode: 'write',
        useWorktree: false,
      },
    },
  })
  const secondPlan = createPlanFixture({
    id: 'plan-auth-guard-ambiguous-b',
    title: '继续推进登录门禁剩余整改',
    focusId: 'focus-inbox',
    status: 'active',
    runtime: {
      runCount: 1,
      lastTaskId: 'task-finished-auth-guard-ambiguous',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-auth-guard-ambiguous-b',
      taskContract: {
        goal: '沿当前鉴权链路继续推进剩余整改',
        scope: '只处理登录门禁主线',
        acceptance: ['当前剩余整改完成'],
      },
      taskTemplate: {
        title: '继续推进登录门禁剩余整改',
        executionSpecId: 'spec-auth-guard-ambiguous-b',
        cwd: '/repo/auth-guard',
        resourceMode: 'write',
        useWorktree: false,
      },
    },
  })

  const result = resolveLowRiskWriteEnqueueContinuation({
    item: {
      type: 'enqueue_task',
      task: {
        title: '继续推进登录门禁当前整改',
        cwd: '/repo/auth-guard',
        mode: 'write',
        use_worktree: false,
        goal: '沿当前鉴权链路继续推进这一批整改',
        in_scope: ['只处理当前登录门禁主线'],
        out_of_scope: [],
        done_when: ['这一批整改完成'],
        context_refs: [],
        instructions: [],
      },
    },
    inputTexts: ['继续把登录门禁这一条线往下做。'],
    planById: new Map([
      [firstPlan.id, firstPlan],
      [secondPlan.id, secondPlan],
    ]),
    resultTaskIds: new Set(['task-finished-auth-guard-ambiguous']),
    defaultFocusId: 'focus-inbox',
  })

  expect(result.ok).toBe(false)
  if (result.ok) throw new Error(`expected ambiguity, got ${result.targetId}`)
  expect(result.reason).toBe('ambiguous_workline')
})

test('enqueue_task(write) stays allowed when user directly references the only active plan even if the next draft is heavily reworded', () => {
  const currentPlan = createPlanFixture({
    id: 'plan-auth-guard-owner-ref',
    title: '继续推进 auth guard 主线',
    focusId: 'focus-inbox',
    status: 'active',
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-auth-guard-owner-ref',
      taskContract: {
        goal: '继续推进 auth guard 主线并落地下一步实现',
        scope: '只处理 auth guard 主线',
        acceptance: ['下一步主线修改完成'],
      },
      taskTemplate: {
        title: '继续推进 auth guard 主线',
        executionSpecId: 'spec-auth-guard-owner-ref',
        cwd: '/repo/auth-guard',
        resourceMode: 'write',
        useWorktree: false,
      },
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: '补齐登录拦截剩余落地点',
          cwd: '/repo/auth-guard',
          mode: 'write',
          use_worktree: false,
          goal: '沿当前鉴权链路继续补实现并完成验收',
          in_scope: ['聚焦登录门禁后续落地'],
          out_of_scope: [],
          done_when: ['后续落地完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [
        createUserInput(
          `继续沿着 ${currentPlan.id} 这条计划推进，直接往下做。`,
        ),
      ],
      planById: new Map([[currentPlan.id, currentPlan]]),
      planStatusById: new Map([[currentPlan.id, currentPlan.status]]),
      resultTaskIds: new Set(['task-finished']),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(0)
})

test('enqueue_task(write) stays allowed when user directly references the only result task even if the next draft is heavily reworded', () => {
  const finishedTask = createIntentEvidenceTask({
    id: 'task-auth-guard-owner-ref',
    title: '收敛 auth guard 的主链',
    cwd: '/repo/auth-guard',
    focusId: 'focus-inbox',
    status: 'succeeded',
    resourceMode: 'write',
    contract: {
      goal: '收敛 auth guard 的主链并给出下一步落地方向',
      scope: '只处理 auth guard 主链',
      acceptance: ['给出主链收敛结果'],
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: '补齐登录拦截剩余落地点',
          cwd: '/repo/auth-guard',
          mode: 'write',
          use_worktree: false,
          goal: '沿当前鉴权链路继续补实现并完成验收',
          in_scope: ['聚焦登录门禁后续落地'],
          out_of_scope: [],
          done_when: ['后续落地完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [
        createUserInput(
          `继续沿着 ${finishedTask.id} 这条任务主线推进，直接往下做。`,
        ),
      ],
      taskById: new Map([[finishedTask.id, finishedTask]]),
      taskStatusById: new Map([[finishedTask.id, finishedTask.status]]),
      resultTaskIds: new Set([finishedTask.id]),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(0)
})

test('set_plan(write) update stays allowed when user directly references the target plan even if the replacement draft is heavily reworded', () => {
  const currentPlan = createPlanFixture({
    id: 'plan-auth-guard-heavy-reword',
    title: '继续推进 auth guard 主线',
    focusId: 'focus-inbox',
    status: 'active',
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-auth-guard-heavy-reword',
      taskContract: {
        goal: '继续推进 auth guard 主线并落地下一步实现',
        scope: '只处理 auth guard 主线',
        acceptance: ['下一步主线修改完成'],
      },
      taskTemplate: {
        title: '继续推进 auth guard 主线',
        executionSpecId: 'spec-auth-guard-heavy-reword',
        cwd: '/repo/auth-guard',
        resourceMode: 'write',
        useWorktree: false,
      },
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'set_plan',
        plan_id: currentPlan.id,
        plan: {
          title: '把剩余鉴权落地改成更大步推进',
          trigger: {
            type: 'on_worker_slot_freed',
          },
          task: {
            title: '按专题批量收敛登录门禁后续落地',
            cwd: '/repo/auth-guard',
            mode: 'write',
            use_worktree: false,
            goal: '按更大步方式把后续登录门禁落地点一次性推完',
            in_scope: ['只处理当前鉴权主线'],
            out_of_scope: [],
            done_when: ['本轮专题落地完成'],
            context_refs: [],
            instructions: [],
          },
          priority: 'normal',
          max_runs: null,
        },
      },
    ],
    {
      inputs: [
        createUserInput(
          `把 ${currentPlan.id} 这个计划改掉，别再细抠了，直接大步推进。`,
        ),
      ],
      planById: new Map([[currentPlan.id, currentPlan]]),
      planStatusById: new Map([[currentPlan.id, currentPlan.status]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(0)
})
