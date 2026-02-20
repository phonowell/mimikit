import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/manager/action-feedback.js'
import { parseActions } from '../src/actions/protocol/parse.js'

test('collectManagerActionFeedback reports unregistered, invalid args, and rejected actions', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'read',
      attrs: {
        filePath: '/tmp/demo.txt',
        limit: '120',
      },
    },
    {
      name: 'create_task',
      attrs: {
        prompt: '',
        title: 'invalid',
        profile: 'standard',
      },
    },
    {
      name: 'create_task',
      attrs: {
        prompt: 'Read .mimikit/history/2026-02-15.jsonl',
        title: 'forbidden',
        profile: 'standard',
      },
    },
    {
      name: 'create_task',
      attrs: {
        prompt: 'scheduled task',
        title: 'legacy deferred profile',
        profile: 'deferred',
      },
    },
    {
      name: 'create_task',
      attrs: {
        prompt: 'past schedule',
        title: 'invalid past schedule',
        scheduled_at: '2000-01-01T00:00:00.000Z',
      },
    },
    {
      name: 'create_task',
      attrs: {
        prompt: 'schedule judged by env now',
        title: 'invalid by env now',
        scheduled_at: '2099-01-01T00:00:00.000Z',
      },
    },
    {
      name: 'cancel_task',
      attrs: {
        id: 'missing-id',
      },
    },
    {
      name: 'cancel_task',
      attrs: {
        id: 'done-id',
      },
    },
    {
      name: 'query_history',
      attrs: {
        query: 'history',
        from: 'not-a-date',
      },
    },
    {
      name: 'compress_context',
      attrs: {},
    },
  ], {
    taskStatusById: new Map([['done-id', 'succeeded']]),
    scheduleNowIso: '2100-01-01T00:00:00.000Z',
  })

  expect(feedback).toHaveLength(10)
  expect(feedback[0]?.action).toBe('read')
  expect(feedback[0]?.error).toBe('unregistered_action')
  expect(feedback[0]?.attempted).toContain('<M:read')
  expect(feedback.some((item) => item.error === 'invalid_action_args')).toBe(
    true,
  )
  expect(
    feedback.some(
      (item) =>
        item.action === 'create_task' &&
        item.error === 'action_execution_rejected',
    ),
  ).toBe(true)
  expect(
    feedback.some(
      (item) =>
        item.action === 'create_task' &&
        item.hint.includes('scheduled_at 必须晚于当前时间'),
    ),
  ).toBe(true)
  expect(
    feedback.some(
      (item) =>
        item.action === 'create_task' &&
        item.error === 'invalid_action_args' &&
        item.attempted.includes('profile="deferred"'),
    ),
  ).toBe(true)
  expect(
    feedback.some(
      (item) =>
        item.action === 'cancel_task' &&
        item.error === 'action_execution_rejected',
    ),
  ).toBe(true)
  expect(
    feedback.some(
      (item) =>
        item.action === 'cancel_task' &&
        item.hint.includes('任务已完成'),
    ),
  ).toBe(true)
  expect(
    feedback.some(
      (item) =>
        item.action === 'query_history' &&
        item.error === 'invalid_action_args',
    ),
  ).toBe(true)
  expect(
    feedback.some(
      (item) =>
        item.action === 'compress_context' &&
        item.error === 'action_execution_rejected',
    ),
  ).toBe(true)
})

test('collectManagerActionFeedback ignores valid registered actions', () => {
  const output =
    '好的，我先创建一个任务。\\n\\n<M:create_task prompt="读取文件，根据反馈补充\\\"编排引擎\\\"定位；短时间定义为<30秒；禁止>50条词表规则。" title="第一轮优化 manager prompt" profile="standard" />'
  const parsed = parseActions(output)
  expect(parsed.actions).toHaveLength(1)
  expect(parsed.actions[0]?.attrs.title).toBe('第一轮优化 manager prompt')
  expect(parsed.actions[0]?.attrs.profile).toBe('standard')
  expect(parsed.text).not.toContain('<M:create_task')

  const feedback = collectManagerActionFeedback(
    [
      ...(parsed.actions[0] ? [parsed.actions[0]] : []),
      {
        name: 'summarize_task_result',
        attrs: {
          task_id: 't1',
          summary: 'ok',
        },
      },
      {
        name: 'cancel_task',
        attrs: {
          id: 't1',
        },
      },
      {
        name: 'query_history',
        attrs: {
          query: 'history',
        },
      },
      {
        name: 'compress_context',
        attrs: {},
      },
    ],
    {
      taskStatusById: new Map([['t1', 'pending']]),
      managerSessionId: 'session-1',
    },
  )

  expect(feedback).toHaveLength(0)
})
