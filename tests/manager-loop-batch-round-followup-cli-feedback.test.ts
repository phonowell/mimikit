import { expect, test, vi } from 'vitest'

import { resolveRoundFollowup } from '../src/manager/loop-batch-round-followup.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/manager/runtime-adapter.js'
import type { Parsed } from '../src/actions/model/spec.js'

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    logLifecycle: vi.fn(),
    logFeedback: vi.fn(),
  },
}))

const { appendLogMock } = vi.hoisted(() => ({
  appendLogMock: vi.fn(async () => undefined),
}))

vi.mock('../src/manager/action-cli-log.js', () => ({
  managerActionCliLogger: loggerMock,
}))

vi.mock('../src/manager/loop-batch-context.js', () => ({
  pickQueryContextRequest: vi.fn(() => undefined),
  pickReadFileRequest: vi.fn(() => undefined),
  buildQueryContextLookupKey: vi.fn(() => undefined),
  buildReadFileLookupKey: vi.fn(() => undefined),
  buildLookupKey: vi.fn(() => undefined),
  queryContextLookup: vi.fn(async () => undefined),
  queryReadFileLookup: vi.fn(async () => undefined),
}))

vi.mock('../src/manager/action-feedback-collect.js', () => ({
  collectManagerActionFeedback: vi.fn(() => [
    {
      action: 'mutate_task',
      error: 'action_execution_rejected',
      hint: 'task already canceled',
    },
    {
      action: 'query_context',
      error: 'invalid_action_args',
      hint: 'schema mismatch',
    },
  ]),
}))

vi.mock('../src/manager/loop-batch-run-helpers.js', async () => {
  const actual = await vi.importActual<typeof import('../src/manager/loop-batch-run-helpers.js')>(
    '../src/manager/loop-batch-run-helpers.js',
  )
  return {
    ...actual,
    hasNoFollowupRequests: vi.fn(() => false),
  }
})

vi.mock('../src/history/manager-events.js', () => ({
  appendActionFeedbackSystemMessage: vi.fn(async () => undefined),
}))

vi.mock('../src/log/append.js', () => ({
  appendLog: appendLogMock,
}))

test('resolveRoundFollowup emits cli feedback logs for rejected and invalid actions', async () => {
  const runtime = (await createTestRuntimeState({
    withGlobalFocus: false,
  })) as RuntimeState
  runtime.paths.log = '/tmp/test-log'
  runtime.config.codex.enabled = true
  runtime.config.codex.capability = 'high'
  runtime.config.codex.billing = 'free'
  runtime.config.opencode.enabled = false
  runtime.config.opencode.capability = 'low'
  runtime.config.opencode.billing = 'free'
  const parsed: Parsed[] = []
  appendLogMock.mockClear()
  await resolveRoundFollowup({
    runtime,
    parsed,
    output: '<M:mutate_task id="task-1" op="cancel" />',
    allowAskUserChoice: true,
    resultTaskIds: new Set<string>(),
    resolveFocusId: () => 'focus-global',
  })

  expect(loggerMock.logFeedback).toHaveBeenCalledTimes(2)
  expect(loggerMock.logFeedback).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      item: expect.objectContaining({
        action: 'mutate_task',
        error: 'action_execution_rejected',
      }),
      index: 1,
      total: 2,
    }),
  )
  expect(loggerMock.logFeedback).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      item: expect.objectContaining({
        action: 'query_context',
        error: 'invalid_action_args',
      }),
      index: 2,
      total: 2,
    }),
  )

  expect(appendLogMock).toHaveBeenCalledTimes(1)
  expect(appendLogMock).toHaveBeenCalledWith(
    '/tmp/test-log',
    expect.objectContaining({
      event: 'manager_action_feedback',
      count: 2,
      errors: ['action_execution_rejected', 'invalid_action_args'],
      names: ['mutate_task', 'query_context'],
      hints: ['task already canceled', 'schema mismatch'],
      hintBuckets: [
        'mutate_task::action_execution_rejected::task already canceled',
        'query_context::invalid_action_args::schema mismatch',
      ],
    }),
  )
})
