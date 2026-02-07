import { expect, test } from 'vitest'

import {
  parseCommandPayload,
  parseCommands,
} from '../src/supervisor/command-parser.js'

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

test('parseCommands parses capture_feedback json payload', () => {
  const output = `<MIMIKIT:commands>\n@capture_feedback {"message":"回答不准确","category":"quality","roiScore":78,"confidence":0.82,"action":"fix"}\n</MIMIKIT:commands>`
  const parsed = parseCommands(output)
  expect(parsed.commands).toHaveLength(1)
  expect(parsed.commands[0]?.action).toBe('capture_feedback')
  const payload = parseCommandPayload<{
    message: string
    category: string
    roiScore: number
    confidence: number
    action: string
  }>(parsed.commands[0]!)
  expect(payload?.message).toBe('回答不准确')
  expect(payload?.category).toBe('quality')
  expect(payload?.roiScore).toBe(78)
  expect(payload?.confidence).toBe(0.82)
  expect(payload?.action).toBe('fix')
})
