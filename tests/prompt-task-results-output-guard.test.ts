import { expect, test } from 'vitest'

import { buildResultsPromptPayload } from '../src/foundation/prompting/format.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'

import type { TaskResult } from '../src/foundation/types/index.js'

test('buildResultsPromptPayload keeps the latest result per task without raw output by default', () => {
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
  expect(payload?.tasks[0]).not.toMatchObject({
    result: {
      output: expect.any(String),
    },
  })
  expect(payload?.tasks[0]).not.toHaveProperty('prompt')
})

test('buildResultsPromptPayload only includes raw output for explicitly allowed tasks', () => {
  const task = createTaskFixture({
    id: 'task-hydrated-result-1',
    title: 'Hydrated result replay',
    prompt: 'Replay archive',
  })
  const result: TaskResult = {
    taskId: task.id,
    status: 'succeeded',
    ok: true,
    output: 'Recovered result body with explicit evidence lines.',
    durationMs: 90,
    completedAt: '2026-03-20T10:10:00.000Z',
    provider: 'codex',
  }

  const hidden = buildResultsPromptPayload([task], [result], '/tmp')
  const explicit = buildResultsPromptPayload([task], [result], '/tmp', {
    includeOutputTaskIds: [task.id],
  })

  expect(hidden?.tasks[0]).not.toMatchObject({
    result: {
      output: expect.any(String),
    },
  })
  expect(explicit?.tasks[0]).toMatchObject({
    result: {
      output: 'Recovered result body with explicit evidence lines.',
    },
  })
})
