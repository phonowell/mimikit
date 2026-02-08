import { expect, test } from 'vitest'

import { extractTellerDigestSummary } from '../src/orchestrator/teller-digest-command.js'

test('extractTellerDigestSummary prefers @teller_digest summary attribute', () => {
  const output = [
    '<MIMIKIT:commands>',
    '@teller_digest summary="用户要先修复摘要传递链路，再校验 thinker 接收格式"',
    '</MIMIKIT:commands>',
  ].join('\n')
  expect(extractTellerDigestSummary(output)).toBe(
    '用户要先修复摘要传递链路，再校验 thinker 接收格式',
  )
})

test('extractTellerDigestSummary supports tag content fallback', () => {
  const output = [
    '<MIMIKIT:handoff_thinker>',
    '目标：确保 teller 摘要通过内部命令稳定传递到 thinker。',
    '</MIMIKIT:handoff_thinker>',
  ].join('\n')
  expect(extractTellerDigestSummary(output)).toBe(
    '目标：确保 teller 摘要通过内部命令稳定传递到 thinker。',
  )
})

test('extractTellerDigestSummary falls back to plain text', () => {
  const output = '用户只关心：本轮先确认链路，再决定是否重构 prompt。'
  expect(extractTellerDigestSummary(output)).toBe(
    '用户只关心：本轮先确认链路，再决定是否重构 prompt。',
  )
})
