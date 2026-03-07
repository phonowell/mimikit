import { expect, test } from 'vitest'

import { clipUtf8ByBytes, truncateText } from '../src/shared/text.js'

test('clipUtf8ByBytes keeps UTF-8 boundary for CJK', () => {
  expect(clipUtf8ByBytes('中文测试', 1)).toBe('')
  expect(clipUtf8ByBytes('中文测试', 3)).toBe('中')
  expect(clipUtf8ByBytes('中文测试', 4)).toBe('中')
  expect(clipUtf8ByBytes('中文测试', 6)).toBe('中文')
})

test('clipUtf8ByBytes keeps UTF-8 boundary for emoji grapheme', () => {
  expect(clipUtf8ByBytes('🙂🙂', 1)).toBe('')
  expect(clipUtf8ByBytes('🙂🙂', 4)).toBe('🙂')
  expect(clipUtf8ByBytes('🙂🙂', 7)).toBe('🙂')
  expect(clipUtf8ByBytes('🙂🙂', 8)).toBe('🙂🙂')
})

test('truncateText is grapheme-safe for emoji', () => {
  expect(truncateText('🙂🙂🙂', 2)).toBe('🙂.')
  expect(truncateText('中文🙂回复', 4, { suffix: '…' })).toBe('中文🙂…')
})
