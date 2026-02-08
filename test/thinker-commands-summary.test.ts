import { expect, test } from 'vitest'

import { parseCommands } from '../src/orchestrator/command-parser.js'
import { collectResultSummaries } from '../src/orchestrator/thinker-commands.js'

test('collectResultSummaries collects summarize_result attrs command', () => {
  const output = `<MIMIKIT:commands>\n@summarize_result taskId="task-1" summary="short summary"\n</MIMIKIT:commands>`
  const parsed = parseCommands(output)
  const summaries = collectResultSummaries(parsed.commands)
  expect(summaries.get('task-1')).toBe('short summary')
})

test('collectResultSummaries keeps latest attrs summary', () => {
  const output = `<MIMIKIT:commands>\n@summarize_result taskId="task-1" summary="first"\n@summarize_result id="task-1" summary="second"\n</MIMIKIT:commands>`
  const parsed = parseCommands(output)
  const summaries = collectResultSummaries(parsed.commands)
  expect(summaries.get('task-1')).toBe('second')
})

test('collectResultSummaries ignores invalid summarize_result commands', () => {
  const output = `<MIMIKIT:commands>\n@summarize_result taskId="task-1"\n@summarize_result summary="missing task id"\n</MIMIKIT:commands>`
  const parsed = parseCommands(output)
  const summaries = collectResultSummaries(parsed.commands)
  expect(summaries.size).toBe(0)
})
