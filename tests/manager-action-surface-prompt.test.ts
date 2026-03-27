import { expect, test } from 'vitest'

import {
  formatManagerActionSurfacePrompt,
  resolveManagerActionSurfacePromptConfig,
} from '../src/policy/manager/action-surface-prompt.js'

test('prompt surface no longer varies by wake profile', () => {
  const prompt = formatManagerActionSurfacePrompt(
    resolveManagerActionSurfacePromptConfig({
      actionFeedback: [
        {
          action: 'query_context',
          error: 'action_execution_rejected',
          hint: 'blocked',
        },
      ],
    }),
  )

  expect(prompt).toContain('默认仅注入简版 action 卡')
  expect(prompt).toContain('type="enqueue_task"')
  expect(prompt).toContain('type="task_control"')
  expect(prompt).toContain('type="set_plan"')
  expect(prompt).not.toContain('type="query_context"')
  expect(prompt).not.toContain('type="read_file"')
  expect(prompt).not.toContain('type="mutate_task"')
  expect(prompt).not.toContain('读取与检索')
})

test('expanded prompt keeps full detail section without wake profile banner', () => {
  const prompt = formatManagerActionSurfacePrompt(
    resolveManagerActionSurfacePromptConfig({
      packetMode: 'expanded',
    }),
  )

  expect(prompt).not.toContain('wake_profile=')
  expect(prompt).not.toContain('type="query_context"')
  expect(prompt).not.toContain('type="read_file"')
  expect(prompt).toContain('type="enqueue_task"')
  expect(prompt).toContain('type="record_task_git"')
  expect(prompt).toContain('type="remember_memory"')
  expect(prompt).not.toContain('type="restart_runtime"')
})
