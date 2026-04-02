import { expect, test } from 'vitest'

import { buildOrchestratorPlanViews } from '../src/surface/orchestrator/orchestrator-webui-snapshot.js'

import { createPlanFixture } from './helpers/runtime-snapshot.js'

test('buildOrchestratorPlanViews projects task contract for WebUI without leaking raw effect', () => {
  const runtime: Pick<
    Parameters<typeof buildOrchestratorPlanViews>[0],
    'domain'
  > = {
    domain: {
      taskPlans: [
        createPlanFixture({
          id: 'plan-contract-1',
          title: 'Expose contract',
          updatedAt: '2026-03-29T10:00:00.000Z',
          runtime: {
            runCount: 2,
            lastTaskId: 'task-contract-1',
          },
          effect: {
            kind: 'enqueue_task',
            taskKey: 'plan-task-key-contract-1',
            taskContract: {
              goal: 'Expose the plan contract in WebUI',
              scope: 'Only show contract digest fields in the plans dialog',
              acceptance: ['Goal and scope are directly readable'],
              outOfScope: 'Do not expose raw worker prompt',
              contextRefs: ['docs/design/workflow/plan.md'],
            },
            taskTemplate: {
              title: 'Plan contract task',
              executionSpecId: 'spec-plan-contract-1',
              cwd: '/tmp/plan-contract',
            },
          },
        }),
      ],
    },
  }

  const result = buildOrchestratorPlanViews(
    runtime as Parameters<typeof buildOrchestratorPlanViews>[0],
  )

  expect(result.items).toHaveLength(1)
  expect(result.items[0]).toMatchObject({
    id: 'plan-contract-1',
    title: 'Expose contract',
    updatedAt: '2026-03-29T10:00:00.000Z',
    lastTaskId: 'task-contract-1',
    taskContract: {
      goal: 'Expose the plan contract in WebUI',
      scope: 'Only show contract digest fields in the plans dialog',
      acceptance: ['Goal and scope are directly readable'],
      outOfScope: 'Do not expose raw worker prompt',
      contextRefs: ['docs/design/workflow/plan.md'],
    },
  })
  expect(result.items[0]).not.toHaveProperty('effect')
})

test('buildOrchestratorPlanViews projects runtime progress for WebUI plans', () => {
  const runtime: Pick<
    Parameters<typeof buildOrchestratorPlanViews>[0],
    'domain'
  > = {
    domain: {
      taskPlans: [
        createPlanFixture({
          id: 'plan-progress-1',
          title: 'Progress visible plan',
          updatedAt: '2026-03-29T11:58:00.000Z',
          runtime: {
            runCount: 4,
            lastTriggeredAt: '2026-03-29T11:57:56.768Z',
            lastTaskId: 'task-progress-1',
          },
        }),
      ],
    },
  }

  const result = buildOrchestratorPlanViews(
    runtime as Parameters<typeof buildOrchestratorPlanViews>[0],
  )

  expect(result.items[0]).toMatchObject({
    id: 'plan-progress-1',
    runCount: 4,
    lastTriggeredAt: '2026-03-29T11:57:56.768Z',
    lastTaskId: 'task-progress-1',
  })
})

test('buildOrchestratorPlanViews projects stage digest for WebUI plans', () => {
  const runtime: Pick<
    Parameters<typeof buildOrchestratorPlanViews>[0],
    'domain'
  > = {
    domain: {
      taskPlans: [
        createPlanFixture({
          id: 'plan-stage-view-1',
          title: 'Stage visible plan',
          runtime: {
            runCount: 2,
            lastTaskId: 'task-stage-view-1',
            stage: {
              summary: '当前阶段已收敛到可执行下一步。',
              risk: '还有一条回归验证未完成。',
              needsDecision: true,
              sourceTaskId: 'task-stage-view-1',
              updatedAt: '2026-04-02T00:11:00.000Z',
            },
          },
        }),
      ],
    },
  }

  const result = buildOrchestratorPlanViews(
    runtime as Parameters<typeof buildOrchestratorPlanViews>[0],
  )

  expect(result.items[0]).toMatchObject({
    id: 'plan-stage-view-1',
    stage: {
      summary: '当前阶段已收敛到可执行下一步。',
      risk: '还有一条回归验证未完成。',
      needsDecision: true,
      sourceTaskId: 'task-stage-view-1',
      updatedAt: '2026-04-02T00:11:00.000Z',
    },
  })
})
