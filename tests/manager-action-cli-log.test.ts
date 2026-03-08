import { expect, test } from 'vitest'

import {
  configureManagerActionCliLogger,
  createManagerActionCliLogger,
} from '../src/manager/action-cli-log.js'

type LogCall = {
  tag: string
  payload: unknown
}

const createSpySink = () => {
  const calls: LogCall[] = []
  const sink = (tag: string, payload: unknown) => {
    calls.push({ tag, payload })
  }
  return { calls, sink }
}

test('manager action cli logger emits lifecycle payload with redacted attrs', () => {
  configureManagerActionCliLogger({ enabled: true })
  const { calls, sink } = createSpySink()
  const logger = createManagerActionCliLogger({ sink })

  void logger.logLifecycle({
    stage: 'dispatch',
    item: {
      name: 'enqueue_task',
      attrs: {
        prompt: 'build release artifact now',
        title: 'release',
        api_key: 'sk-super-secret',
        authorization: 'Bearer ABCDEFG',
      },
    },
    index: 1,
    total: 2,
  })

  expect(calls).toHaveLength(1)
  expect(calls[0]?.tag).toBe('[manager] action')
  expect(calls[0]?.payload).toMatchObject({
    stage: 'dispatch',
    action: 'enqueue_task',
    index: 1,
    total: 2,
    attrCount: 4,
    attrs: {
      prompt: 'build release artifact now',
      title: 'release',
      api_key: '[REDACTED]',
      authorization: '[REDACTED]',
    },
  })
})

test('manager action cli logger emits feedback stage from action feedback error', () => {
  configureManagerActionCliLogger({ enabled: true })
  const { calls, sink } = createSpySink()
  const logger = createManagerActionCliLogger({ sink })

  void logger.logFeedback({
    item: {
      action: 'mutate_task',
      error: 'action_execution_rejected',
      hint: 'task already canceled',
    },
    index: 1,
    total: 1,
  })

  expect(calls).toHaveLength(1)
  expect(calls[0]?.tag).toBe('[manager] action')
  expect(calls[0]?.payload).toMatchObject({
    stage: 'rejected',
    action: 'mutate_task',
    index: 1,
    total: 1,
    error: 'action_execution_rejected',
    hint: 'task already canceled',
  })
})

test('manager action cli logger can disable console sink while keeping payload generation', async () => {
  configureManagerActionCliLogger({ enabled: false })
  const { calls, sink } = createSpySink()
  const logger = createManagerActionCliLogger({ sink })
  await logger.logLifecycle({
    stage: 'dispatch',
    item: { name: 'enqueue_task', attrs: { prompt: 'noop' } },
    index: 1,
    total: 1,
  })

  expect(calls).toHaveLength(0)
  configureManagerActionCliLogger({ enabled: true })
})

test('manager action cli logger extracts action/task ids from action attrs', async () => {
  configureManagerActionCliLogger({ enabled: true })
  const { calls, sink } = createSpySink()
  const logger = createManagerActionCliLogger({ sink })
  await logger.logLifecycle({
    stage: 'applied',
    item: {
      name: 'mutate_task',
      attrs: {
        id: 'task-123',
        op: 'cancel',
      },
    },
    index: 1,
    total: 1,
    result: 'continue',
    elapsedMs: 8,
  })

  expect(calls).toHaveLength(1)
  expect(calls[0]?.payload).toMatchObject({
    stage: 'applied',
    action: 'mutate_task',
    actionId: 'task-123',
    taskId: 'task-123',
    elapsedMs: 8,
  })
})

test('manager action cli logger extracts ids from attempted feedback payload', async () => {
  configureManagerActionCliLogger({ enabled: true })
  const { calls, sink } = createSpySink()
  const logger = createManagerActionCliLogger({ sink })
  await logger.logFeedback({
    item: {
      action: 'enqueue_task',
      error: 'invalid_action_args',
      hint: 'schema mismatch',
      attempted:
        '<M:enqueue_task id="task-xy" task_id="task-xy" prompt="demo" />',
    },
    index: 1,
    total: 1,
  })

  expect(calls).toHaveLength(1)
  expect(calls[0]?.payload).toMatchObject({
    stage: 'invalid',
    action: 'enqueue_task',
    actionId: 'task-xy',
    taskId: 'task-xy',
  })
})
