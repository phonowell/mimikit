import { expect, test } from 'vitest'

import { parseActions } from '../src/actions/protocol/parse.js'

test('parseActions hides trailing partial M tag fragments during streaming', () => {
  expect(parseActions('reply in progress...\n<M:ac').text).toBe(
    'reply in progress...',
  )
  expect(parseActions('reply in progress...\n</M:act').text).toBe(
    'reply in progress...',
  )
})

test('parseActions keeps partial M tags inside fenced code blocks', () => {
  const output = ['```xml', '<M:ac', '```'].join('\n')
  expect(parseActions(output).text).toBe(output)
})
