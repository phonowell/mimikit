import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { createScrollController } from '../webui/messages/scroll.js'

const originalWindow = globalThis.window
const originalDocument = globalThis.document
const originalResizeObserver = globalThis.ResizeObserver

const installDomStubs = () => {
  const windowStub = {
    addEventListener: vi.fn(),
    matchMedia: () => ({ matches: false }),
  }
  const documentStub = { activeElement: null }
  class ResizeObserverStub {
    observe() {}
  }
  Object.defineProperty(globalThis, 'window', {
    value: windowStub,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'document', {
    value: documentStub,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverStub,
    configurable: true,
    writable: true,
  })
}

const restoreDomStubs = () => {
  Object.defineProperty(globalThis, 'window', {
    value: originalWindow,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'document', {
    value: originalDocument,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: originalResizeObserver,
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  installDomStubs()
})

afterEach(() => {
  restoreDomStubs()
})

test('keeps bottom pinned after container height shrinks when user was at bottom', () => {
  const messagesEl = {
    scrollHeight: 1000,
    clientHeight: 500,
    scrollTop: 500,
    addEventListener: vi.fn(),
    scrollTo: vi.fn(),
  }

  const scroll = createScrollController({
    messagesEl,
    scrollBottomBtn: null,
    scrollBottomMultiplier: 1.5,
  })

  scroll.bindScrollControls()
  messagesEl.clientHeight = 400

  scroll.syncAfterLayoutShift()

  expect(messagesEl.scrollTo).toHaveBeenCalledWith({
    top: 1000,
    behavior: 'auto',
  })
})

test('does not force jump to bottom after container resize when user is browsing history', () => {
  const messagesEl = {
    scrollHeight: 3000,
    clientHeight: 500,
    scrollTop: 1000,
    addEventListener: vi.fn(),
    scrollTo: vi.fn(),
  }

  const scroll = createScrollController({
    messagesEl,
    scrollBottomBtn: null,
    scrollBottomMultiplier: 1.5,
  })

  scroll.bindScrollControls()
  messagesEl.clientHeight = 400

  scroll.syncAfterLayoutShift()

  expect(messagesEl.scrollTo).not.toHaveBeenCalled()
})
