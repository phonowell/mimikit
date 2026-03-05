import { expect, test } from 'vitest'

import { parseFocusOpenItems } from '../src/focus/parse.js'

test('parseFocusOpenItems accepts simple delimiter-separated text', () => {
  expect(parseFocusOpenItems('a||b')).toEqual(['a', 'b'])
  expect(parseFocusOpenItems('single item')).toEqual(['single item'])
  expect(parseFocusOpenItems(' || ')).toBeUndefined()
  expect(parseFocusOpenItems('')).toBeUndefined()
})
