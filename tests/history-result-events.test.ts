import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { appendConsumedResultsToHistory } from '../src/persistence/history/result-events.js'
import { createTaskFixture } from './helpers/runtime-snapshot.js'

import type { TaskResult } from '../src/foundation/types/index.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-history-results-'))

test('appendConsumedResultsToHistory stores stable summary output on task state', async () => {
  const historyDir = await createTmpDir()
  const task = createTaskFixture({
    id: 'task-history-1',
    title: 'Ship release',
    status: 'running',
  })
  const result: TaskResult = {
    taskId: task.id,
    status: 'succeeded',
    ok: true,
    output: 'RAW: internal executor notes that should not leak back',
    durationMs: 12,
    completedAt: '2026-03-24T10:00:00.000Z',
    handoff: {
      summary: 'Release is ready for review.',
    },
  }

  const consumed = await appendConsumedResultsToHistory(
    join(historyDir, 'history.jsonl'),
    [task],
    [result],
  )

  expect(consumed).toBe(1)
  expect(task.result?.output).toBe('Release is ready for review.')
  expect(task.result?.output).not.toContain('RAW:')
})
