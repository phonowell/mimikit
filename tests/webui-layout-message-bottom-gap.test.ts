import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

const layoutSource = readFileSync(
  new URL('../webui/layout.css', import.meta.url),
  'utf8',
)

const readMessagesPadding = () => {
  const match = layoutSource.match(
    /\.messages\s*\{[\s\S]*?padding:\s*(\d+)px\s+(\d+)px\s+(\d+)px;/,
  )
  if (!match)
    throw new Error('Expected .messages padding declaration in layout.css')

  return {
    top: Number.parseInt(match[1] ?? '', 10),
    horizontal: Number.parseInt(match[2] ?? '', 10),
    bottom: Number.parseInt(match[3] ?? '', 10),
  }
}

test('messages list keeps a tighter bottom inset than its top gutter', () => {
  const padding = readMessagesPadding()

  expect(padding.top).toBe(16)
  expect(padding.horizontal).toBe(18)
  expect(padding.bottom).toBeLessThan(padding.top)
  expect(padding.bottom).toBeLessThanOrEqual(10)
})
