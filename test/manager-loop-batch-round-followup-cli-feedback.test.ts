import { expect, test, vi } from 'vitest'

import { resolveRoundFollowup } from '../src/manager/loop-batch-round-followup.js'

import type { RuntimeState } from '../src/manager/runtime-adapter.js'
import type { Parsed } from '../src/actions/model/spec.js'

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    logLifecycle: vi.fn(),
    logFeedback: vi.fn(),
  },
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
  appendLog: vi.fn(async () => undefined),
}))

const runtime = {
  paths: { log: '/tmp/test-log' },
  tasks: [],
  taskPlans: [],
  config: {
    codex: { enabled: true, capability: 'high', billing: 'free' },
    opencode: { enabled: false, capability: 'low', billing: 'free' },
  },
} as RuntimeState

test('resolveRoundFollowup emits cli feedback logs for rejected and invalid actions', async () => {
  const parsed: Parsed[] = []
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
})
