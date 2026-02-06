import { expect, test } from 'vitest'

import {
  normalizeWindowParams,
  selectByWindow,
} from '../src/supervisor/select-window.js'

test('normalizeWindowParams clamps invalid values', () => {
  expect(
    normalizeWindowParams({
      minCount: -1,
      maxCount: -5,
      maxBytes: -100,
    }),
  ).toEqual({ minCount: 0, maxCount: 0, maxBytes: 0 })
  expect(
    normalizeWindowParams({
      minCount: 5,
      maxCount: 2,
      maxBytes: 10,
    }),
  ).toEqual({ minCount: 5, maxCount: 5, maxBytes: 10 })
})

test('selectByWindow enforces min before bytes stop', () => {
  const items = ['aaa', 'bbb', 'ccc']
  const selected = selectByWindow(
    items,
    { minCount: 2, maxCount: 10, maxBytes: 4 },
    (item) => item.length,
  )
  expect(selected).toEqual(['aaa', 'bbb'])
})

test('selectByWindow stops on maxCount', () => {
  const items = [1, 2, 3, 4]
  const selected = selectByWindow(
    items,
    { minCount: 0, maxCount: 2, maxBytes: 0 },
    () => 1,
  )
  expect(selected).toEqual([1, 2])
})
