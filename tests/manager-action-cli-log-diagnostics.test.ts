import { beforeEach, expect, test, vi } from 'vitest'

const hoistedMocks = vi.hoisted(() => ({
  appendLogMock: vi.fn(() => Promise.resolve(undefined)),
}))

vi.mock('../src/persistence/log/append.js', () => ({
  appendLog: hoistedMocks.appendLogMock,
}))

const { configureManagerActionCliLogger, createManagerActionCliLogger } =
  await import('../src/policy/manager/action-cli-log.js')

beforeEach(() => {
  hoistedMocks.appendLogMock.mockClear()
  configureManagerActionCliLogger({
    enabled: false,
    logPath: '/tmp/mimikit-manager-action-diagnostics.jsonl',
  })
})

test('manager action logger persists batch and round diagnostics for lifecycle and feedback entries', async () => {
  const logger = createManagerActionCliLogger({
    sink: () => undefined,
  })

  await logger.logLifecycle({
    stage: 'dispatch',
    item: {
      type: 'enqueue_task',
      task: {
        title: 'collect diagnostics',
        cwd: '/repo/mimikit',
        mode: 'write',
        goal: 'collect diagnostics',
        in_scope: ['only diagnostics'],
        out_of_scope: [],
        done_when: ['diagnostics linked'],
        context_refs: [],
        instructions: [],
      },
    },
    index: 1,
    total: 1,
    traceId: 'thread-manager-1',
    batchId: 'batch-1',
    roundId: 'round-1',
  })

  await logger.logFeedback({
    item: {
      action: 'enqueue_task',
      error: 'action_execution_rejected',
      hint: 'need user input',
      attempted: '{"task_id":"task-1"}',
    },
    index: 1,
    total: 1,
    traceId: 'thread-manager-1',
    batchId: 'batch-1',
    roundId: 'round-1',
  })

  expect(hoistedMocks.appendLogMock).toHaveBeenCalledWith(
    '/tmp/mimikit-manager-action-diagnostics.jsonl',
    expect.objectContaining({
      event: 'manager_action',
      traceId: 'thread-manager-1',
      batchId: 'batch-1',
      roundId: 'round-1',
    }),
  )
})
