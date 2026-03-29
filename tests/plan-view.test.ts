import { expect, test } from 'vitest'

import { buildOrchestratorPlanViews } from '../src/surface/orchestrator/orchestrator-webui-snapshot.js'

import { createPlanFixture } from './helpers/runtime-snapshot.js'

test('buildOrchestratorPlanViews projects task contract for WebUI without leaking raw effect', () => {
  const runtime: Pick<
    Parameters<typeof buildOrchestratorPlanViews>[0],
    'taskPlans'
  > = {
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
