import { expect, test } from 'vitest'

import { extractActionText } from '../src/actions/protocol/extract-block.js'

test('extractActionText strips trailing unclosed meta tag from visible text', () => {
  const parsed = extractActionText('结论先输出\n<M:plan_update task="task-1">')

  expect(parsed.text).toBe('结论先输出')
  expect(parsed.actionText).toBe('')
})

test('extractActionText keeps code block content that looks like meta tag', () => {
  const parsed = extractActionText('```xml\n<M:plan_update task="task-1">\n```')

  expect(parsed.text).toBe('```xml\n<M:plan_update task="task-1">\n```')
  expect(parsed.actionText).toBe('')
})
