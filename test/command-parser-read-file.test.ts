import { expect, test } from 'vitest'

import { parseCommands } from '../src/supervisor/command-parser.js'

test('parseCommands parses read_file line command', () => {
  const output = `我先看下文件。\n\n<MIMIKIT:commands>\n@read_file path="src/cli.ts" start="1" limit="120"\n</MIMIKIT:commands>`
  const parsed = parseCommands(output)
  expect(parsed.commands).toHaveLength(1)
  expect(parsed.commands[0]?.action).toBe('read_file')
  expect(parsed.commands[0]?.attrs.path).toBe('src/cli.ts')
  expect(parsed.commands[0]?.attrs.start).toBe('1')
  expect(parsed.commands[0]?.attrs.limit).toBe('120')
  expect(parsed.text).toBe('我先看下文件。')
})

