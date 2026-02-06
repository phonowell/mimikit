import { expect, test } from 'vitest'

import { parseCommands } from '../src/supervisor/command-parser.js'

test('parseCommands parses add_task line command and keeps text', () => {
  const output = `我来创建任务。\n\n<MIMIKIT:commands>\n@add_task prompt="整理接口文档" title="整理文档"\n</MIMIKIT:commands>`
  const parsed = parseCommands(output)
  expect(parsed.commands).toHaveLength(1)
  expect(parsed.commands[0]?.action).toBe('add_task')
  expect(parsed.commands[0]?.attrs.prompt).toBe('整理接口文档')
  expect(parsed.commands[0]?.attrs.title).toBe('整理文档')
  expect(parsed.text).toBe('我来创建任务。')
})

test('parseCommands parses cancel_task line command', () => {
  const output = `<MIMIKIT:commands>\n@cancel_task id="task_123"\n</MIMIKIT:commands>`
  const parsed = parseCommands(output)
  expect(parsed.commands).toHaveLength(1)
  expect(parsed.commands[0]?.action).toBe('cancel_task')
  expect(parsed.commands[0]?.attrs.id).toBe('task_123')
  expect(parsed.text).toBe('')
})
