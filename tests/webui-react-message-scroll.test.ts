import { expect, test } from 'vitest'

import { isScrollStateNearBottom } from '../webui-src/lib/message-scroll.js'

test('near-bottom detection keeps a small fixed threshold', () => {
  expect(
    isScrollStateNearBottom({
      clientHeight: 400,
      distance: 500,
      scrollHeight: 1_300,
      scrollTop: 400,
    }),
  ).toBe(false)
})

test('near-bottom detection keeps the follow zone tight', () => {
  expect(
    isScrollStateNearBottom({
      clientHeight: 400,
      distance: 36,
      scrollHeight: 1_300,
      scrollTop: 864,
    }),
  ).toBe(true)
})
