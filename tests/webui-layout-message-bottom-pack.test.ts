import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

const layoutCss = readFileSync(
  new URL('../webui/layout.css', import.meta.url),
  'utf8',
)

test('messages list declares a bottom-pack rule for short underflow lists', () => {
  expect(layoutCss).toMatch(
    /\.messages\s*>\s*:first-child\s*\{\s*margin-top:\s*auto;\s*\}/,
  )
})
