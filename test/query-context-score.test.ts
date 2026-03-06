import { expect, test } from 'vitest'

import { scoreQueryCandidate, tokenizeSearchText } from '../src/manager/query-context-score.js'

test('tokenizeSearchText emits CJK n-gram features', () => {
  const tokens = tokenizeSearchText('请用中文简洁回复')
  expect(tokens.some((token) => token.startsWith('cjk:中文'))).toBe(true)
})

test('scoreQueryCandidate matches CJK paraphrase text', () => {
  const score = scoreQueryCandidate({
    query: '请用中文回复并保持简洁',
    isWildcard: false,
    haystack: '后续需要中文且尽量简洁地回答',
    timeMs: 100,
    oldestMs: 0,
    newestMs: 200,
  })
  expect(score > 0).toBe(true)
})
