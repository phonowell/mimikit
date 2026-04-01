import { expect, test } from 'vitest'

import {
  getTaskLiveOutputById,
  setTaskLiveOutput,
} from '../src/execution/worker/live-output.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

test('setTaskLiveOutput keeps a command summary instead of raw command output', async () => {
  const runtime = await createTestRuntimeState()

  expect(
    setTaskLiveOutput(
      runtime,
      'task-live-output',
      '$ rg -n "task-progress" src\nsrc/persistence/storage/task-progress.ts:1',
    ),
  ).toBe(true)

  expect(getTaskLiveOutputById(runtime)?.get('task-live-output')).toBe(
    'running command: rg -n "task-progress" src',
  )
})

test('setTaskLiveOutput keeps concise user-facing progress text', async () => {
  const runtime = await createTestRuntimeState()

  expect(
    setTaskLiveOutput(
      runtime,
      'task-live-output-text',
      'Summarizing the latest task progress for review.',
    ),
  ).toBe(true)

  expect(getTaskLiveOutputById(runtime)?.get('task-live-output-text')).toBe(
    'Summarizing the latest task progress for review.',
  )
})
