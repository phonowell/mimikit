import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { appendConsumedResultsToHistory } from '../src/orchestrator/roles/teller/teller-history.js'
import type { Task, TaskResult } from '../src/types/index.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-thinker-history-'))

const createTask = (): Task => ({
  id: 'task-1',
  fingerprint: 'fp-task-1',
  prompt: 'do something',
  title: 'Task One',
  profile: 'standard',
  status: 'succeeded',
  createdAt: '2026-02-07T00:00:00.000Z',
})

const createResult = (): TaskResult => ({
  taskId: 'task-1',
  status: 'succeeded',
  ok: true,
  output: 'very detailed worker output',
  durationMs: 123,
  completedAt: '2026-02-07T00:01:00.000Z',
})

test('appendConsumedResultsToHistory writes summary into task.result output', async () => {
  const stateDir = await createTmpDir()
  const historyPath = join(stateDir, 'history.jsonl')
  const task = createTask()
  const result = createResult()
  const consumed = await appendConsumedResultsToHistory(
    historyPath,
    [task],
    [result],
    new Map([['task-1', 'short summary for thinker']]),
  )
  expect(consumed).toBe(1)
  expect(task.result?.output).toBe('short summary for thinker')
})

test('appendConsumedResultsToHistory creates local summary when command missing', async () => {
  const stateDir = await createTmpDir()
  const historyPath = join(stateDir, 'history.jsonl')
  const task = createTask()
  const result: TaskResult = {
    ...createResult(),
    output: `  ${'detail '.repeat(80)}  `,
  }
  const consumed = await appendConsumedResultsToHistory(historyPath, [task], [result])
  expect(consumed).toBe(1)
  expect(task.result?.output.length ?? 0).toBeLessThanOrEqual(281)
  expect(task.result?.output.endsWith('…')).toBe(true)
  const historyRaw = await readFile(historyPath, 'utf8')
  expect(historyRaw.length).toBeGreaterThan(0)
})
