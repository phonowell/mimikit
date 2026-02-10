import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  appendConsumedInputsToHistory,
  appendConsumedResultsToHistory,
} from '../src/manager/history.js'
import { readHistory } from '../src/storage/jsonl.js'
import type { Task, TaskResult, UserInput } from '../src/types/index.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-manager-history-'))

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
    new Map([['task-1', 'short summary for manager']]),
  )
  expect(consumed).toBe(1)
  expect(task.result?.output).toBe('short summary for manager')
})

test('appendConsumedResultsToHistory creates local summary when command missing', async () => {
  const stateDir = await createTmpDir()
  const historyPath = join(stateDir, 'history.jsonl')
  const task = createTask()
  const result: TaskResult = {
    ...createResult(),
    output: `  ${'detail '.repeat(80)}  `,
  }
  const consumed = await appendConsumedResultsToHistory(
    historyPath,
    [task],
    [result],
  )
  expect(consumed).toBe(1)
  expect(task.result?.output.length ?? 0).toBeLessThanOrEqual(281)
  expect(task.result?.output.endsWith('…')).toBe(true)
  const historyRaw = await readFile(historyPath, 'utf8')
  expect(historyRaw.length).toBeGreaterThan(0)
})

test('appendConsumedInputsToHistory is idempotent by input id', async () => {
  const stateDir = await createTmpDir()
  const historyPath = join(stateDir, 'history.jsonl')
  const input: UserInput = {
    id: 'in-1',
    text: 'hello',
    createdAt: '2026-02-07T00:02:00.000Z',
  }

  const first = await appendConsumedInputsToHistory(historyPath, [input])
  const second = await appendConsumedInputsToHistory(historyPath, [input])
  const history = await readHistory(historyPath)

  expect(first).toBe(1)
  expect(second).toBe(1)
  expect(history.filter((item) => item.id === 'in-1')).toHaveLength(1)
})
