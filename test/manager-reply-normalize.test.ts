import { expect, test } from 'vitest'

import { normalizeManagerReplyText } from '../src/manager/reply-normalize.js'

test('normalizes repeated consecutive lines', () => {
  const output = normalizeManagerReplyText(
    ['结论：先执行 A', '结论：先执行 A', '', '下一步：执行 B', '下一步：执行 B'].join(
      '\n',
    ),
  )

  expect(output).toBe('结论：先执行 A\n\n下一步：执行 B')
})

test('normalizes repeated consecutive paragraphs', () => {
  const output = normalizeManagerReplyText(
    ['先给结论，再执行任务。', '', '先给结论，再执行任务。', '', '最后回传结果。'].join(
      '\n',
    ),
  )

  expect(output).toBe('先给结论，再执行任务。\n\n最后回传结果。')
})

test('keeps repeated line across blank line when paragraph differs', () => {
  const output = normalizeManagerReplyText(
    ['结论：A', '补充：B', '', '补充：B', '下一步：C'].join('\n'),
  )
  expect(output).toBe('结论：A\n补充：B\n\n补充：B\n下一步：C')
})

test('does not hard truncate long reply', () => {
  const output = normalizeManagerReplyText(`结论：${'a'.repeat(1_400)}`)
  expect(output.length).toBeGreaterThan(1_200)
  expect(output.endsWith('a')).toBe(true)
})
