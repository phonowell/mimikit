import { expect, test } from 'vitest'

import {
  resolveComposerFocusRestore,
  shouldCaptureComposerFocusRestore,
} from '../webui-src/components/Composer.js'

test('captures focus restoration only for an active submit from the composer', () => {
  expect(
    shouldCaptureComposerFocusRestore({
      hasActiveComposerFocus: true,
      sendPending: false,
      value: 'hello',
    }),
  ).toBe(true)

  expect(
    shouldCaptureComposerFocusRestore({
      hasActiveComposerFocus: false,
      sendPending: false,
      value: 'hello',
    }),
  ).toBe(false)

  expect(
    shouldCaptureComposerFocusRestore({
      hasActiveComposerFocus: true,
      sendPending: true,
      value: 'hello',
    }),
  ).toBe(false)

  expect(
    shouldCaptureComposerFocusRestore({
      hasActiveComposerFocus: true,
      sendPending: false,
      value: '   ',
    }),
  ).toBe(false)
})

test('restores focus only when a tracked submit finishes sending', () => {
  expect(
    resolveComposerFocusRestore({
      pendingRestoreFocus: true,
      previousSendPending: true,
      sendPending: false,
    }),
  ).toBe(true)

  expect(
    resolveComposerFocusRestore({
      pendingRestoreFocus: false,
      previousSendPending: true,
      sendPending: false,
    }),
  ).toBe(false)

  expect(
    resolveComposerFocusRestore({
      pendingRestoreFocus: true,
      previousSendPending: false,
      sendPending: false,
    }),
  ).toBe(false)

  expect(
    resolveComposerFocusRestore({
      pendingRestoreFocus: true,
      previousSendPending: true,
      sendPending: true,
    }),
  ).toBe(false)
})
