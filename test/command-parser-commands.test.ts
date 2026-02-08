import { expect, test } from 'vitest'

import { parseCommands } from '../src/orchestrator/command-parser.js'

test('parseCommands parses line commands and keeps plain text', () => {
  const output = `Create one task.\n\n<MIMIKIT:commands>\n@add_task prompt="整理接口文档" title="整理文档"\n</MIMIKIT:commands>`
  const parsed = parseCommands(output)
  expect(parsed.text).toBe('Create one task.')
  expect(parsed.commands).toHaveLength(1)
  expect(parsed.commands[0]).toMatchObject({
    action: 'add_task',
    attrs: {
      prompt: '整理接口文档',
      title: '整理文档',
    },
  })
})

test.each([
  {
    name: 'cancel_task attrs',
    output: `<MIMIKIT:commands>\n@cancel_task id="task_123"\n</MIMIKIT:commands>`,
    action: 'cancel_task',
    attrs: { id: 'task_123' },
  },
  {
    name: 'capture_feedback attrs',
    output: `<MIMIKIT:commands>\n@capture_feedback message="回答不准确"\n</MIMIKIT:commands>`,
    action: 'capture_feedback',
    attrs: { message: '回答不准确' },
  },
  {
    name: 'escaped attrs',
    output:
      `<MIMIKIT:commands>\n@write path="a.txt" content="line1\\nline2\\\"q\\\""\n</MIMIKIT:commands>`,
    action: 'write',
    attrs: { path: 'a.txt', content: 'line1\nline2"q"' },
  },
])('parseCommands parses $name', ({ output, action, attrs }) => {
  const parsed = parseCommands(output)
  expect(parsed.text).toBe('')
  expect(parsed.commands).toHaveLength(1)
  expect(parsed.commands[0]).toMatchObject({ action, attrs })
})
