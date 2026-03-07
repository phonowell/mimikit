import { expect, test } from 'vitest'

import { createManagerActionCliLogger } from '../src/manager/action-cli-log.js'

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
  const { calls, sink } = createSpySink()
  const logger = createManagerActionCliLogger({ sink })

  logger.logLifecycle({
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
  const { calls, sink } = createSpySink()
  const logger = createManagerActionCliLogger({ sink })

  logger.logFeedback({
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
