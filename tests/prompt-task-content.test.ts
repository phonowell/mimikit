import { expect, test } from 'vitest'

import {
  buildPlansPromptPayload,
  buildTasksPromptPayload,
} from '../src/foundation/prompting/format.js'

import {
  createPlanFixture,
  createTaskFixture,
} from './helpers/runtime-snapshot.js'

import type { TaskResult } from '../src/foundation/types/index.js'

test('buildTasksPromptPayload omits result-only fallback and plan title still falls back to id', () => {
  const resultOnly: TaskResult = {
    taskId: 'task-result-only',
    status: 'failed',
    ok: false,
    output: 'failed output',
    durationMs: 42,
    completedAt: '2026-03-20T12:00:00.000Z',
    provider: 'codex',
  }
  const tasksPayload = buildTasksPromptPayload([], [resultOnly], '/tmp')
  const planPayload = buildPlansPromptPayload([
    createPlanFixture({
      id: 'plan-collapse-1',
      title: '',
      status: 'done',
      runtime: {
        runCount: 0,
        doneReason: 'completed',
      },
      trigger: {
        mode: 'scheduled_at',
        scheduledAt: '2026-03-20T13:00:00.000Z',
      },
    }),
  ])

  expect(tasksPayload).toBeUndefined()
  expect(planPayload?.plans[0]).toMatchObject({
    id: 'plan-collapse-1',
    title: 'plan-collapse-1',
    done_reason: 'completed',
  })
  for (const field of [
    'task_prompt',
    'task_goal',
    'task_scope',
    'task_acceptance',
  ])
    expect(planPayload?.plans[0]).not.toHaveProperty(field)
})

test('buildTasksPromptPayload keeps archive path but does not duplicate detailed result', () => {
  const contract = {
    goal: 'Keep manager aligned to the real task contract',
    scope: 'Only expose contract digest in state payload',
    acceptance: [
      'Task payload includes goal, scope, and acceptance',
      'Task payload does not inline worker prompt',
    ],
    outOfScope: 'Do not include raw execution transcript',
    contextRefs: ['docs/design/workflow/task.md'],
  }
  const task = createTaskFixture({
    id: 'task-collapse-state-1',
    title: 'State only task',
    archivePath: '/tmp/task-collapse-state-1.md',
    contract,
  })
  const result: TaskResult = {
    taskId: task.id,
    status: 'succeeded',
    ok: true,
    output: 'final output',
    durationMs: 12,
    completedAt: '2026-03-20T12:30:00.000Z',
    archivePath: '/tmp/task-collapse-state-1.md',
  }

  const payload = buildTasksPromptPayload([task], [result], '/tmp')

  expect(payload?.tasks[0]).toMatchObject({
    id: task.id,
    archive_path: 'task-collapse-state-1.md',
    contract: {
      goal: contract.goal,
      scope: contract.scope,
      acceptance: contract.acceptance,
      out_of_scope: contract.outOfScope,
      context_refs: contract.contextRefs,
    },
  })
  expect(payload?.tasks[0]).not.toHaveProperty('prompt')
  expect(payload?.tasks[0]).not.toHaveProperty('result')
})

test('buildPlansPromptPayload exposes task contract digest without reviving legacy aliases', () => {
  const plan = createPlanFixture({
    id: 'plan-contract-1',
    effect: {
      kind: 'enqueue_task',
      taskContract: {
        goal: 'Expose plan task contract to manager',
        scope: 'Only include digest fields needed for orchestration',
        acceptance: ['Manager can inspect plan goal before triggering'],
        outOfScope: 'Do not expose full worker prompt',
        contextRefs: ['docs/design/workflow/plan.md'],
      },
      taskKey: 'task-key-plan-contract-1',
      taskTemplate: {
        title: 'Refresh manager contract view',
        executionSpecId: 'spec-plan-contract-1',
        cwd: '/tmp/runtime-snapshot-plan-task',
        resourceMode: 'write',
      },
    },
  })

  const payload = buildPlansPromptPayload([plan])

  expect(payload?.plans[0]).toMatchObject({
    id: 'plan-contract-1',
    task_contract: {
      goal: 'Expose plan task contract to manager',
      scope: 'Only include digest fields needed for orchestration',
      acceptance: ['Manager can inspect plan goal before triggering'],
      out_of_scope: 'Do not expose full worker prompt',
      context_refs: ['docs/design/workflow/plan.md'],
    },
  })
  for (const field of ['task_goal', 'task_scope', 'task_acceptance'])
    expect(payload?.plans[0]).not.toHaveProperty(field)
})
