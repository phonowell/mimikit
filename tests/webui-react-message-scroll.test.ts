import { expect, test } from 'vitest'

import {
  isScrollStateNearBottom,
  shouldStickAfterLayoutShift,
} from '../webui-src/lib/message-scroll.js'

test('near-bottom detection scales with the viewport height', () => {
  expect(
    isScrollStateNearBottom({
      clientHeight: 400,
      distance: 500,
      scrollHeight: 1_300,
      scrollTop: 400,
    }),
  ).toBe(true)
})

test('layout shift keeps the list pinned when it was already near bottom', () => {
  expect(
    shouldStickAfterLayoutShift({
      previousClientHeight: 400,
      previousScrollHeight: 1_000,
      state: {
        clientHeight: 360,
        distance: 20,
        scrollHeight: 1_020,
        scrollTop: 640,
      },
    }),
  ).toBe(true)
})

test('layout shift does not pull the list when the reader is far from bottom', () => {
  expect(
    shouldStickAfterLayoutShift({
      previousClientHeight: 400,
      previousScrollHeight: 1_000,
      state: {
        clientHeight: 360,
        distance: 800,
        scrollHeight: 1_020,
        scrollTop: 0,
      },
    }),
  ).toBe(false)
})
