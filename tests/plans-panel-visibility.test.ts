import { expect, test, vi } from 'vitest'

import { hasSnapshotItems, syncPlansEntryVisibility } from '../webui/panels.js'

test('hasSnapshotItems treats missing and empty payloads as hidden', () => {
  expect(hasSnapshotItems(null)).toBe(false)
  expect(hasSnapshotItems({})).toBe(false)
  expect(hasSnapshotItems({ items: [] })).toBe(false)
})

test('hasSnapshotItems shows the entry when at least one plan exists', () => {
  expect(hasSnapshotItems({ items: [{ id: 'plan-1' }] })).toBe(true)
})

test('syncPlansEntryVisibility hides the trigger and closes an open dialog', () => {
  const close = vi.fn()
  const plansOpenBtn = { hidden: false }
  const plansDialog = { open: true, close }

  syncPlansEntryVisibility({ plansOpenBtn, plansDialog, hasPlans: false })

  expect(plansOpenBtn.hidden).toBe(true)
  expect(close).toHaveBeenCalledTimes(1)
})

test('syncPlansEntryVisibility shows the trigger without closing the dialog', () => {
  const close = vi.fn()
  const plansOpenBtn = { hidden: true }
  const plansDialog = { open: false, close }

  syncPlansEntryVisibility({ plansOpenBtn, plansDialog, hasPlans: true })

  expect(plansOpenBtn.hidden).toBe(false)
  expect(close).not.toHaveBeenCalled()
})
