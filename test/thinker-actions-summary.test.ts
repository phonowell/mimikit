import { expect, test } from 'vitest'

import { parseActions } from '../src/actions/protocol/parse.js'
import { collectTaskResultSummaries } from '../src/thinker/action-apply.js'

test('collectTaskResultSummaries collects summarize_task_result attrs action', () => {
  const output = `<MIMIKIT:actions>\n@summarize_task_result task_id="task-1" summary="short summary"\n</MIMIKIT:actions>`
  const parsed = parseActions(output)
  const summaries = collectTaskResultSummaries(parsed.actions)
  expect(summaries.get('task-1')).toBe('short summary')
})

test('collectTaskResultSummaries keeps latest attrs summary', () => {
  const output = `<MIMIKIT:actions>\n@summarize_task_result task_id="task-1" summary="first"\n@summarize_task_result task_id="task-1" summary="second"\n</MIMIKIT:actions>`
  const parsed = parseActions(output)
  const summaries = collectTaskResultSummaries(parsed.actions)
  expect(summaries.get('task-1')).toBe('second')
})

test('collectTaskResultSummaries ignores invalid summarize_task_result actions', () => {
  const output = `<MIMIKIT:actions>\n@summarize_task_result task_id="task-1"\n@summarize_task_result summary="missing task id"\n</MIMIKIT:actions>`
  const parsed = parseActions(output)
  const summaries = collectTaskResultSummaries(parsed.actions)
  expect(summaries.size).toBe(0)
})
