import { expect, test } from 'vitest'

import { parseFocusOpenItems } from '../src/focus/parse.js'

test('parseFocusOpenItems only accepts JSON array string format', () => {
  expect(parseFocusOpenItems('["a", "b"]')).toEqual(['a', 'b'])
  expect(parseFocusOpenItems('[]')).toEqual([])
  expect(parseFocusOpenItems('a||b||c')).toBeUndefined()
  expect(parseFocusOpenItems('{"a":1}')).toBeUndefined()
})
