import { expect, test } from 'vitest'

import { extractDigestSummary } from '../src/teller/digest-summary.js'

test('extractDigestSummary prefers @digest_context summary attribute', () => {
  const output = [
    '<MIMIKIT:actions>',
    '@digest_context summary="用户要先修复摘要传递链路，再校验 thinker 接收格式"',
    '</MIMIKIT:actions>',
  ].join('\n')
  expect(extractDigestSummary(output)).toBe(
    '用户要先修复摘要传递链路，再校验 thinker 接收格式',
  )
})

test('extractDigestSummary supports @handoff_context summary attribute', () => {
  const output = [
    '<MIMIKIT:actions>',
    '@handoff_context summary="目标：确保 teller 摘要通过内部动作稳定传递到 thinker。"',
    '</MIMIKIT:actions>',
  ].join('\n')
  expect(extractDigestSummary(output)).toBe(
    '目标：确保 teller 摘要通过内部动作稳定传递到 thinker。',
  )
})

test('extractDigestSummary returns empty when summary action missing', () => {
  const output = '用户只关心：本轮先确认链路，再决定是否重构 prompt。'
  expect(extractDigestSummary(output)).toBe('')
})
