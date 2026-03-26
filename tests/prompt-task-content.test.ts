import { expect, test } from 'vitest'

import {
  buildPlansPromptPayload,
  buildResultsPromptPayload,
  buildTasksPromptPayload,
} from '../src/foundation/prompting/format.js'
import type { TaskResult } from '../src/foundation/types/index.js'
import { createPlanFixture, createTaskFixture } from './helpers/runtime-snapshot.js'

test('buildResultsPromptPayload keeps the latest result per task', () => {
  const task = createTaskFixture({
    id: 'task-collapse-1',
    title: 'Collapse format layer',
    prompt: 'Refactor prompt format',
  })
  const results: TaskResult[] = [
    {
      taskId: task.id,
      status: 'failed',
      ok: false,
      output: 'old result',
      durationMs: 100,
      completedAt: '2026-03-20T10:00:00.000Z',
      provider: 'codex',
    },
    {
      taskId: task.id,
      status: 'succeeded',
      ok: true,
      output: 'new result',
      durationMs: 90,
      completedAt: '2026-03-20T10:10:00.000Z',
      provider: 'codex',
    },
  ]
  const payload = buildResultsPromptPayload([task], results, '/tmp')

  expect(payload?.tasks).toHaveLength(1)
  expect(payload?.tasks[0]).toMatchObject({
    id: task.id,
    changed_at: '2026-03-20T10:10:00.000Z',
    result: {
      status: 'succeeded',
      ok: true,
    },
  })
  expect(payload?.tasks[0]).not.toHaveProperty('prompt')
})

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
  expect(planPayload?.plans[0]).not.toHaveProperty('task_prompt')
  expect(planPayload?.plans[0]).not.toHaveProperty('task_goal')
  expect(planPayload?.plans[0]).not.toHaveProperty('task_scope')
  expect(planPayload?.plans[0]).not.toHaveProperty('task_acceptance')
})

test('buildTasksPromptPayload keeps archive path but does not duplicate detailed result', () => {
  const task = createTaskFixture({
    id: 'task-collapse-state-1',
    title: 'State only task',
    archivePath: '/tmp/task-collapse-state-1.md',
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
  })
  expect(payload?.tasks[0]).not.toHaveProperty('prompt')
  expect(payload?.tasks[0]).not.toHaveProperty('result')
})

test('buildTasksPromptPayload exposes only truthful git execution fields', () => {
  const task = createTaskFixture({
    id: 'task-git-1',
    git: {
      worktreePath: '/tmp/task-git-1',
      branch: 'hotfix/task-git-1',
    },
  })

  const payload = buildTasksPromptPayload([task], [], '/tmp')

  expect(payload?.tasks[0]).toMatchObject({
    id: 'task-git-1',
    git: {
      worktree_path: 'task-git-1',
      branch: 'hotfix/task-git-1',
    },
  })
  expect(payload?.tasks[0]).not.toHaveProperty('git.review_status')
  expect(payload?.tasks[0]).not.toHaveProperty('git.merge_status')
  expect(payload?.tasks[0]).not.toHaveProperty('git.cleanup_status')
})
