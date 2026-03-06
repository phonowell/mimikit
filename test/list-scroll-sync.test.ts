import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  captureListScrollState,
  createListLayoutShiftSync,
  restoreListScrollState,
} from '../webui/list-scroll-sync.js'

const originalWindow = globalThis.window
const originalDocument = globalThis.document
const originalResizeObserver = globalThis.ResizeObserver
const originalMutationObserver = globalThis.MutationObserver

const installDomStubs = () => {
  const windowStub = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestAnimationFrame: (callback) => callback(),
  }
  const fontsStub = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const documentStub = { fonts: fontsStub }
  class ResizeObserverStub {
    observe() {}
    disconnect() {}
  }
  class MutationObserverStub {
    observe() {}
    disconnect() {}
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
  Object.defineProperty(globalThis, 'MutationObserver', {
    value: MutationObserverStub,
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
  Object.defineProperty(globalThis, 'MutationObserver', {
    value: originalMutationObserver,
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

test('restore keeps bottom pinned for near-bottom list state', () => {
  const listEl = {
    scrollHeight: 1000,
    clientHeight: 500,
    scrollTop: 500,
  }
  const previous = captureListScrollState(listEl)
  listEl.scrollHeight = 1300

  restoreListScrollState(listEl, previous)

  expect(listEl.scrollTop).toBe(800)
})

test('restore keeps reading position when user is not near bottom', () => {
  const listEl = {
    scrollHeight: 2000,
    clientHeight: 500,
    scrollTop: 600,
  }
  const previous = captureListScrollState(listEl)
  listEl.scrollHeight = 2400

  restoreListScrollState(listEl, previous)

  expect(listEl.scrollTop).toBe(600)
})

test('layout sync keeps bottom pinned after list container shrink', () => {
  const listEl = {
    scrollHeight: 1000,
    clientHeight: 500,
    scrollTop: 500,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const sync = createListLayoutShiftSync({ listEl })
  sync.bind()
  listEl.clientHeight = 420

  sync.syncAfterLayoutShift()

  expect(listEl.scrollTop).toBe(580)
})

test('layout sync does not jump after list changes when user reads history', () => {
  const listEl = {
    scrollHeight: 2200,
    clientHeight: 500,
    scrollTop: 600,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const sync = createListLayoutShiftSync({ listEl })
  sync.bind()
  listEl.scrollHeight = 2600

  sync.syncAfterLayoutShift()

  expect(listEl.scrollTop).toBe(600)
})

test('layout sync keeps reading position with strict near-bottom threshold', () => {
  const listEl = {
    scrollHeight: 2000,
    clientHeight: 500,
    scrollTop: 1200,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const sync = createListLayoutShiftSync({
    listEl,
    bottomThresholdMultiplier: 0.1,
  })
  sync.bind()
  listEl.scrollHeight = 2300

  sync.syncAfterLayoutShift()

  expect(listEl.scrollTop).toBe(1200)
})
