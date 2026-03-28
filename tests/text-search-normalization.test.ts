import { expect, test } from 'vitest'

import {
  scoreTextOverlap,
  tokenizeSearchText,
} from '../src/foundation/shared/text-search.js'
import { isSupportedByInputs } from '../src/policy/manager/action-intent-evidence-match.js'

test('tokenizeSearchText folds fullwidth latin text into ASCII tokens', () => {
  expect(tokenizeSearchText('ＡＰＩ 文档（兼容）')).toContain('api')
})

test('scoreTextOverlap treats fullwidth digits as the same mixed CJK token', () => {
  expect(scoreTextOverlap('任务123', '任务１２３')).toBe(1)
})

test('scoreTextOverlap folds common CJK punctuation into ASCII equivalents', () => {
  expect(scoreTextOverlap('修复：API 文档', '修复: API 文档')).toBe(1)
})

test('isSupportedByInputs matches normalized direct text for mixed fullwidth phrases', () => {
  expect(
    isSupportedByInputs({
      candidates: ['ＡＰＩ review'],
      inputs: ['请处理 API review'],
    }),
  ).toBe(true)
})
