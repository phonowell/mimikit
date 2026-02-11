import { expect, test } from 'vitest'

import { parseActions } from '../src/actions/protocol/parse.js'

test('parseActions parses line actions and keeps plain text', () => {
  const output = `Create one task.\n\n<MIMIKIT:actions>\n@create_task prompt="整理接口文档" title="整理文档" profile="standard"\n</MIMIKIT:actions>`
  const parsed = parseActions(output)
  expect(parsed.text).toBe('Create one task.')
  expect(parsed.actions).toHaveLength(1)
  expect(parsed.actions[0]).toMatchObject({
    name: 'create_task',
    attrs: {
      prompt: '整理接口文档',
      title: '整理文档',
      profile: 'standard',
    },
  })
})

test.each([
  {
    name: 'escaped attrs',
    output:
      `<MIMIKIT:actions>\n@write_file path="a.txt" content="line1\\nline2\\\"q\\\""\n</MIMIKIT:actions>`,
    action: 'write_file',
    attrs: { path: 'a.txt', content: 'line1\nline2"q"' },
  },
])('parseActions parses $name', ({ output, action, attrs }) => {
  const parsed = parseActions(output)
  expect(parsed.text).toBe('')
  expect(parsed.actions).toHaveLength(1)
  expect(parsed.actions[0]).toMatchObject({ name: action, attrs })
})
