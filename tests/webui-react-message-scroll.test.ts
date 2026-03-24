import { expect, test } from 'vitest'

import { shouldStickAfterLayoutShift } from '../webui-src/lib/message-scroll.js'

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
        distance: 180,
        scrollHeight: 1_020,
        scrollTop: 480,
      },
    }),
  ).toBe(false)
})
