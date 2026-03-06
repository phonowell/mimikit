import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/manager/action-feedback-collect.js'

test('ask_user_choice is rejected when telegram source does not support choice callback', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'ask_user_choice',
        attrs: {
          id: 'choice-format',
          question: 'choose format',
          options_json:
            '[{"id":"option-a","label":"A","reason":"alpha"},{"id":"option-b","label":"B","reason":"beta"}]',
          default_option_id: 'option-a',
        },
      },
    ],
    {
      allowAskUserChoice: false,
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('ask_user_choice')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('Telegram')
})

test('lookup actions reject repeated calls in the same round', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'query_context',
      attrs: {
        query: 'deploy',
        scopes: 'tasks,focus',
      },
    },
    {
      name: 'query_context',
      attrs: {
        query: 'release',
        scopes: 'history',
      },
    },
    {
      name: 'query_context',
      attrs: {
        query: 'second history pass',
        scopes: 'history',
      },
    },
    {
      name: 'read_file',
      attrs: {
        path: 'README.md',
      },
    },
    {
      name: 'read_file',
      attrs: {
        path: 'src/cli/index.ts',
      },
    },
  ])

  expect(feedback).toHaveLength(3)
  expect(feedback[0]?.action).toBe('query_context')
  expect(feedback[0]?.hint).toContain('同一轮最多保留一个 query_context')
  expect(feedback[1]?.action).toBe('query_context')
  expect(feedback[1]?.hint).toContain('同一轮最多保留一个 query_context')
  expect(feedback[2]?.action).toBe('read_file')
  expect(feedback[2]?.hint).toContain('同一轮最多保留一个 read_file')
})

test('lookup duplicate guard only counts schema-valid actions', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'query_context',
      attrs: {
        query: '',
        scopes: 'history',
      },
    },
    {
      name: 'query_context',
      attrs: {
        query: 'valid query',
        scopes: 'history',
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('query_context')
  expect(feedback[0]?.error).toBe('invalid_action_args')
})

test('query_context invalid scope returns invalid_action_args', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'query_context',
      attrs: {
        query: 'deploy',
        scopes: 'tasks,unknown_scope',
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('query_context')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('scopes')
})

test('summarize_task_result rejects task_id outside current batch results', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'summarize_task_result',
        attrs: {
          task_id: 'task-other',
          summary: 'done',
        },
      },
    ],
    {
      resultTaskIds: new Set(['task-current']),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('summarize_task_result')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('task_id 不在当前批次结果中')
})

test('assign_focus requires explicit target_type', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'assign_focus',
      attrs: {
        target_id: 'task-1',
        focus_id: 'focus-demo',
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('assign_focus')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('target_type')
})

test('upsert_focus rejects json-shaped open_items payload', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'upsert_focus',
      attrs: {
        id: 'focus-demo',
        open_items: '["a","b"]',
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('upsert_focus')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('open_items')
})

test('update_plan requires trigger_mode when patching trigger fields', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'update_plan',
        attrs: {
          id: 'plan-1',
          cooldown_ms: '1000',
        },
      },
    ],
    {
      planStatusById: new Map([['plan-1', 'active']]),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('update_plan')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('trigger_mode')
})
