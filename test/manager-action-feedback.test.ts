import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/manager/action-feedback.js'
import { parseActions } from '../src/actions/protocol/parse.js'

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

test('collectManagerActionFeedback reports invalid create_task args when prompt is empty', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'create_task',
      attrs: {
        prompt: '',
        title: 'invalid',
        profile: 'standard',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.error).toBe('invalid_action_args')
})

test('collectManagerActionFeedback rejects create_task reading protected state path', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'create_task',
      attrs: {
        prompt: 'Read .mimikit/history/2026-02-15.jsonl',
        title: 'forbidden',
        profile: 'standard',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('create_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
})

test('collectManagerActionFeedback rejects legacy deferred create_task profile', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'create_task',
      attrs: {
        prompt: 'scheduled task',
        title: 'legacy deferred profile',
        profile: 'deferred',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.attempted).toContain('profile="deferred"')
})

test('collectManagerActionFeedback rejects create_task scheduled_at that is not in future', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'create_task',
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

test('collectManagerActionFeedback rejects compress_context without manager session', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'compress_context',
      attrs: {},
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('compress_context')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
})

test('parseActions extracts create_task action and strips tag text', () => {
  const output =
    '好的，我先创建一个任务。\\n\\n<M:create_task prompt="读取文件，根据反馈补充\\\"编排引擎\\\"定位；短时间定义为<30秒；禁止>50条词表规则。" title="第一轮优化 manager prompt" profile="standard" />'
  const parsed = parseActions(output)
  expect(parsed.actions).toHaveLength(1)
  expect(parsed.actions[0]?.attrs.title).toBe('第一轮优化 manager prompt')
  expect(parsed.actions[0]?.attrs.profile).toBe('standard')
  expect(parsed.text).not.toContain('<M:create_task')
})

test('collectManagerActionFeedback ignores valid create_task action', () => {
  const output =
    '好的，我先创建一个任务。\\n\\n<M:create_task prompt="读取文件，根据反馈补充\\\"编排引擎\\\"定位；短时间定义为<30秒；禁止>50条词表规则。" title="第一轮优化 manager prompt" profile="standard" />'
  const parsed = parseActions(output)
  if (!parsed.actions[0]) throw new Error('action must be parsed')
  const feedback = collectManagerActionFeedback(
    [
      parsed.actions[0],
    ],
  )
  expect(feedback).toHaveLength(0)
})
