import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/manager/action-feedback-collect.js'
import { resolveManagerActionSurface } from '../src/manager/action-surface.js'
import {
  formatManagerActionSurfacePrompt,
  resolveManagerActionSurfacePromptConfig,
} from '../src/manager/action-surface-prompt.js'

test('task_result wake profile only exposes lookup task and plan actions', () => {
  const surface = resolveManagerActionSurface('task_result')

  expect([...surface.actionNames].sort()).toEqual([
    'create_plan',
    'delete_plan',
    'enqueue_task',
    'mutate_task',
    'query_context',
    'read_file',
    'set_task_result_summary',
    'update_plan',
  ])
  expect(surface.actionNames.has('remember_memory')).toBe(false)
  expect(surface.actionNames.has('upsert_focus')).toBe(false)
  expect(surface.actionNames.has('ask_user_choice')).toBe(false)
})

test('collectManagerActionFeedback rejects registered action outside active surface', () => {
  const surface = resolveManagerActionSurface('task_result')
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'remember_memory',
        attrs: {
          content: 'Always keep replies terse',
        },
      },
    ],
    {
      wakeProfile: 'task_result',
      allowedActions: surface.actionNames,
    },
  )

  expect(feedback).toEqual([
    expect.objectContaining({
      action: 'remember_memory',
      error: 'action_execution_rejected',
      hint: expect.stringContaining('wake_profile=task_result'),
    }),
  ])
})

test('default prompt only injects brief action cards', () => {
  const surface = resolveManagerActionSurface('mixed')

  const prompt = formatManagerActionSurfacePrompt(surface)

  expect(prompt).toContain('必填 `title,cwd,goal,in_scope,done_when_1`')
  expect(prompt).not.toContain('可选 `branch,out_of_scope,context_ref_{1..3},focus_id,provider`')
  expect(prompt).not.toContain('### 详细参数契约（按需注入）')
})

test('feedback-driven prompt config only injects detail for failed actions', () => {
  const promptConfig = resolveManagerActionSurfacePromptConfig({
    wakeProfile: 'mixed',
    packetMode: 'expanded',
    actionFeedback: [
      {
        action: 'enqueue_task',
        error: 'invalid_action_args',
        hint: 'missing required attrs',
      },
      {
        action: 'read_file',
        error: 'action_execution_rejected',
        hint: 'path required',
      },
      {
        action: 'remember_memory',
        error: 'unregistered_action',
        hint: 'ignored',
      },
    ],
  })

  expect(promptConfig.includeAllDetails).toBe(false)
  expect([...promptConfig.detailActionNames].sort()).toEqual([
    'enqueue_task',
    'read_file',
  ])

  const prompt = formatManagerActionSurfacePrompt(promptConfig)

  expect(prompt).toContain('当前按反馈补充失败 action：')
  expect(prompt).toContain('M:enqueue_task')
  expect(prompt).toContain('M:read_file')
  expect(prompt).toContain('可选 `branch,out_of_scope,context_ref_{1..3},focus_id,provider`')
  expect(prompt).toContain('可选 `from_line,max_lines,max_chars`')
  expect(prompt).not.toContain('`done` plan 仅允许补 `last_task_id`')
})

test('expanded follow-up injects full detail when no failed action is pinned', () => {
  const briefPrompt = formatManagerActionSurfacePrompt(
    resolveManagerActionSurface('task_result'),
  )
  const promptConfig = resolveManagerActionSurfacePromptConfig({
    wakeProfile: 'task_result',
    packetMode: 'expanded',
  })

  expect(promptConfig.includeAllDetails).toBe(true)

  const detailedPrompt = formatManagerActionSurfacePrompt(promptConfig)

  expect(detailedPrompt).toContain('### 详细参数契约（按需注入）')
  expect(detailedPrompt).toContain('`done` plan 仅允许补 `last_task_id`')
  expect(Buffer.byteLength(detailedPrompt, 'utf8')).toBeGreaterThan(
    Buffer.byteLength(briefPrompt, 'utf8'),
  )
})
