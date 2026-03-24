import { expect, test } from 'vitest'

import { parseUpsertFocusAttrs } from '../src/policy/manager/action-apply-focus-attrs.js'

test('parseUpsertFocusAttrs rejects multiline summary digests', () => {
  expect(
    parseUpsertFocusAttrs({
      id: 'focus-demo',
      summary: 'line one\nline two',
    }),
  ).toBeUndefined()
})

test('parseUpsertFocusAttrs rejects checklist-shaped open items', () => {
  expect(
    parseUpsertFocusAttrs({
      id: 'focus-demo',
      open_item_1: '- first step',
    }),
  ).toBeUndefined()
})
