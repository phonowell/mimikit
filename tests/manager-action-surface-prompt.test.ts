import { expect, test } from 'vitest'

import {
  formatManagerActionSurfacePrompt,
  resolveManagerActionSurfacePromptConfig,
} from '../src/manager/action-surface-prompt.js'

test('task_result prompt surface excludes lookup actions even with lookup feedback', () => {
  const prompt = formatManagerActionSurfacePrompt(
    resolveManagerActionSurfacePromptConfig({
      wakeProfile: 'task_result',
      actionFeedback: [
        {
          action: 'query_context',
          error: 'action_execution_rejected',
          hint: 'blocked',
        },
      ],
    }),
  )

  expect(prompt).toContain('wake_profile=`task_result`')
  expect(prompt).not.toContain('M:enqueue_task')
  expect(prompt).not.toContain('M:mutate_task')
  expect(prompt).not.toContain('M:query_context')
  expect(prompt).not.toContain('M:read_file')
  expect(prompt).not.toContain('读取与检索')
})

test('expanded user_input prompt includes lookup details', () => {
  const prompt = formatManagerActionSurfacePrompt(
    resolveManagerActionSurfacePromptConfig({
      wakeProfile: 'user_input',
      packetMode: 'expanded',
    }),
  )

  expect(prompt).not.toContain('M:query_context')
  expect(prompt).not.toContain('M:read_file')
  expect(prompt).toContain('M:enqueue_task')
  expect(prompt).toContain('M:remember_memory')
})
