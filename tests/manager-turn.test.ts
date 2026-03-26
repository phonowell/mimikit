import { expect, test } from 'vitest'

import {
  buildManagerTurnOutputSchema,
  parseManagerTurn,
} from '../src/policy/manager/manager-turn.js'

test('buildManagerTurnOutputSchema emits a closed top-level object', () => {
  expect(buildManagerTurnOutputSchema()).toMatchObject({
    type: 'json_schema',
    name: 'manager_turn',
    strict: true,
    schema: {
      type: 'object',
      required: ['version', 'reply_text', 'actions'],
      additionalProperties: false,
      properties: expect.objectContaining({
        version: expect.any(Object),
        reply_text: expect.any(Object),
        actions: expect.any(Object),
      }),
    },
  })
})

test('buildManagerTurnOutputSchema uses provider-compatible structured output envelope', () => {
  expect(buildManagerTurnOutputSchema()).toEqual(
    expect.objectContaining({
      type: 'json_schema',
      name: 'manager_turn',
      strict: true,
      schema: expect.any(Object),
    }),
  )
})

test('parseManagerTurn normalizes structured enqueue_task action into internal action attrs', () => {
  const parsed = parseManagerTurn({
    version: 'manager-turn/v1',
    reply_text: '开始执行',
    actions: [
      {
        type: 'enqueue_task',
        title: '实现 manager json turn',
        cwd: '/tmp/mimikit',
        resource_mode: 'write',
        branch: 'feature/manager-json-turn',
        focus_id: 'focus-manager',
        worker_prompt: null,
        goal: '把 manager 输出切到 structured json turn',
        in_scope: 'manager 主链、provider、文档',
        out_of_scope: 'worker 协议',
        done_when: ['manager 不再输出 XML action'],
        context_refs: ['docs/design/workflow/action.md'],
      },
    ],
  })

  expect(parsed.replyText).toBe('开始执行')
  expect(parsed.actions).toEqual([
    {
      name: 'enqueue_task',
      attrs: {
        title: '实现 manager json turn',
        cwd: '/tmp/mimikit',
        resource_mode: 'write',
        branch: 'feature/manager-json-turn',
        focus_id: 'focus-manager',
        goal: '把 manager 输出切到 structured json turn',
        in_scope: 'manager 主链、provider、文档',
        out_of_scope: 'worker 协议',
        done_when_1: 'manager 不再输出 XML action',
        context_ref_1: 'docs/design/workflow/action.md',
      },
    },
  ])
})

test('parseManagerTurn normalizes structured ask_user_choice options into indexed attrs', () => {
  const parsed = parseManagerTurn({
    version: 'manager-turn/v1',
    reply_text: '需要你确认',
    actions: [
      {
        type: 'ask_user_choice',
        id: 'choice-manager-json-turn',
        question: '是否继续迁移？',
        default_option_id: 'option-continue',
        focus_id: null,
        options: [
          {
            id: 'option-continue',
            label: '继续',
            reason: '直接切到最终态',
          },
          {
            id: 'option-stop',
            label: '暂停',
            reason: '先复盘风险',
          },
        ],
      },
    ],
  })

  expect(parsed.actions).toEqual([
    {
      name: 'ask_user_choice',
      attrs: {
        id: 'choice-manager-json-turn',
        question: '是否继续迁移？',
        default_option_id: 'option-continue',
        option_1_id: 'option-continue',
        option_1_label: '继续',
        option_1_reason: '直接切到最终态',
        option_2_id: 'option-stop',
        option_2_label: '暂停',
        option_2_reason: '先复盘风险',
      },
    },
  ])
})

test('parseManagerTurn rejects missing required top-level fields', () => {
  expect(() =>
    parseManagerTurn({
      version: 'manager-turn/v1',
      actions: [],
    }),
  ).toThrow()
})
