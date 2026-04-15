import { expect, test } from 'vitest'

import { resolveLowRiskWriteEnqueueContinuation } from '../src/policy/manager/action-intent-evidence-write-target.js'

import { createPlanFixture } from './helpers/runtime-snapshot.js'

test('two equally anchored worklines differing only by focus stay ambiguous', () => {
  const firstPlan = createPlanFixture({
    id: 'plan-auth-guard-focus-a',
    title: '继续推进登录门禁后续整改',
    focusId: 'focus-a',
    status: 'active',
    runtime: {
      runCount: 1,
      lastTaskId: 'task-finished-auth-guard-focus-ambiguous',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-auth-guard-focus-a',
      taskContract: {
        goal: '沿当前鉴权链路继续推进后续整改',
        scope: '只处理登录门禁主线',
        acceptance: ['当前后续整改完成'],
      },
      taskTemplate: {
        title: '继续推进登录门禁后续整改',
        executionSpecId: 'spec-auth-guard-focus-a',
        cwd: '/repo/auth-guard',
        resourceMode: 'write',
        useWorktree: false,
      },
    },
  })
  const secondPlan = createPlanFixture({
    id: 'plan-auth-guard-focus-b',
    title: '继续推进登录门禁剩余整改',
    focusId: 'focus-b',
    status: 'active',
    runtime: {
      runCount: 1,
      lastTaskId: 'task-finished-auth-guard-focus-ambiguous',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-auth-guard-focus-b',
      taskContract: {
        goal: '沿当前鉴权链路继续推进剩余整改',
        scope: '只处理登录门禁主线',
        acceptance: ['当前剩余整改完成'],
      },
      taskTemplate: {
        title: '继续推进登录门禁剩余整改',
        executionSpecId: 'spec-auth-guard-focus-b',
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
    inputTexts: [],
    planById: new Map([
      [firstPlan.id, firstPlan],
      [secondPlan.id, secondPlan],
    ]),
    resultTaskIds: new Set(['task-finished-auth-guard-focus-ambiguous']),
    defaultFocusId: 'focus-a',
  })

  expect(result.ok).toBe(false)
  if (result.ok) throw new Error(`expected ambiguity, got ${result.targetId}`)
  expect(result.reason).toBe('ambiguous_workline')
})
