import { expect, test } from 'vitest'

import {
  MAX_CONTINUE_LATEST_OUTPUT_CHARS,
  buildContinuePrompt,
  hasDoneMarker,
  stripDoneMarker,
} from '../src/worker/profiled-runner-loop.js'

test('done marker detection uses skill_usage done status only', () => {
  const doneOutput =
    '结论：已完成\n<M:skill_usage status="done">plan-implementation</M:skill_usage>'
  const doneOutputVariant =
    "结论：已完成\n<M:skill_usage source=\"x\" status = 'done'>plan-implementation</M:skill_usage>"
  const legacyOutput = '结论：已完成\n<M:task_done/>'

  expect(hasDoneMarker(doneOutput)).toBe(true)
  expect(hasDoneMarker(doneOutputVariant)).toBe(true)
  expect(stripDoneMarker(doneOutput)).toBe('结论：已完成')
  expect(stripDoneMarker(doneOutputVariant)).toBe('结论：已完成')
  expect(hasDoneMarker(legacyOutput)).toBe(false)
})

test('continue prompt clips latest output to configured max chars', () => {
  const template = '{{ latest_output }}\n{{ done_tag_pattern }}'
  const longOutput = `A${'b'.repeat(MAX_CONTINUE_LATEST_OUTPUT_CHARS + 300)}`
  const prompt = buildContinuePrompt(template, 'inline-template', longOutput, 2)
  const [latestLine] = prompt.split('\n')

  expect(latestLine?.length).toBeLessThanOrEqual(
    MAX_CONTINUE_LATEST_OUTPUT_CHARS,
  )
  expect(latestLine?.endsWith('...')).toBe(true)
  expect(prompt).toContain('<M:skill_usage status="done">')
})
