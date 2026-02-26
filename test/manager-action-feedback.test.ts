import { expect, test } from 'vitest'

import { parseActions } from '../src/actions/protocol/parse.js'
import { collectManagerActionFeedback } from '../src/manager/action-feedback-collect.js'

test('collectManagerActionFeedback reports unregistered action', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'read',
      attrs: {
        filePath: '/tmp/demo.txt',
        limit: '120',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('read')
  expect(feedback[0]?.error).toBe('unregistered_action')
  expect(feedback[0]?.attempted).toContain('<M:read')
})

test('collectManagerActionFeedback reports invalid run_task args when prompt is empty', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'run_task',
      attrs: {
        prompt: '',
        title: 'invalid',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.error).toBe('invalid_action_args')
})

test('collectManagerActionFeedback rejects run_task reading protected state path', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'run_task',
      attrs: {
        prompt: 'Read .mimikit/history/2026-02-15.jsonl',
        title: 'forbidden',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('run_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
})

test('collectManagerActionFeedback rejects schedule_task scheduled_at that is not in future', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'schedule_task',
        attrs: {
          prompt: 'schedule judged by env now',
          title: 'invalid by env now',
          scheduled_at: '2099-01-01T00:00:00.000Z',
        },
      },
    ],
    {
      scheduleNowIso: '2100-01-01T00:00:00.000Z',
    },
  )
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('scheduled_at 必须晚于当前时间')
})

test('collectManagerActionFeedback rejects cancel_task for missing task id', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'cancel_task',
      attrs: {
        id: 'missing-id',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('cancel_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
})

test('collectManagerActionFeedback rejects cancel_task for completed task', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'cancel_task',
        attrs: {
          id: 'done-id',
        },
      },
    ],
    {
      taskStatusById: new Map([['done-id', 'succeeded']]),
    },
  )
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('任务已完成')
})

test('collectManagerActionFeedback rejects delete_intent for done item', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'delete_intent',
        attrs: { id: 'intent-done' },
      },
    ],
    {
      intentStatusById: new Map([['intent-done', 'done']]),
    },
  )
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('delete_intent')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('done intent 不可删除')
})

test('collectManagerActionFeedback reports invalid query_history date args', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'query_history',
      attrs: {
        query: 'history',
        from: 'not-a-date',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('query_history')
  expect(feedback[0]?.error).toBe('invalid_action_args')
})

test('collectManagerActionFeedback rejects compress_context when context is unavailable', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'compress_context',
      attrs: {},
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('compress_context')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('无可压缩上下文')
})

test('collectManagerActionFeedback ignores valid run_task action', () => {
  const output =
    '好的，我先创建一个任务。\\n\\n<M:run_task prompt="读取文件，根据反馈补充\\"编排引擎\\"定位；短时间定义为<30秒；禁止>50条词表规则。" title="第一轮优化 manager prompt" />'
  const parsed = parseActions(output)
  if (!parsed.actions[0]) throw new Error('action must be parsed')
  const feedback = collectManagerActionFeedback([parsed.actions[0]])
  expect(feedback).toHaveLength(0)
})
