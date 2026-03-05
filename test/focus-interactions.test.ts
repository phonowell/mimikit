import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { bindFocusInteractions } from '../webui/focus-interactions.js'

const originalWindow = globalThis.window
const originalElement = globalThis.Element

class FakeElement {
  #classes = new Set<string>()
  #attributes = new Map<string, string>()
  parentElement: FakeElement | null = null

  constructor(classes: string[] = []) {
    for (const className of classes) this.#classes.add(className)
  }

  setAttribute(name: string, value: string) {
    this.#attributes.set(name, String(value))
  }

  getAttribute(name: string) {
    return this.#attributes.get(name) ?? null
  }

  closest(selector: string): FakeElement | null {
    if (selector !== '.focus-link') return null
    let cursor: FakeElement | null = this
    while (cursor) {
      if (cursor.#classes.has('focus-link')) return cursor
      cursor = cursor.parentElement
    }
    return null
  }
}

type ClickHandler = (event: { target: unknown; preventDefault: () => void }) => void

class FakeList {
  #clickHandlers = new Set<ClickHandler>()

  addEventListener(type: string, handler: ClickHandler) {
    if (type !== 'click') return
    this.#clickHandlers.add(handler)
  }

  removeEventListener(type: string, handler: ClickHandler) {
    if (type !== 'click') return
    this.#clickHandlers.delete(handler)
  }

  click(target: unknown) {
    for (const handler of this.#clickHandlers) {
      handler({ target, preventDefault: vi.fn() })
    }
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'Element', {
    value: FakeElement,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'window', {
    value: {
      open: vi.fn(() => ({})),
    },
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'Element', {
    value: originalElement,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'window', {
    value: originalWindow,
    configurable: true,
    writable: true,
  })
})

test('focus link opens archive viewer when item is openable', () => {
  const focusesList = new FakeList()
  bindFocusInteractions(focusesList as unknown as HTMLElement)

  const link = new FakeElement(['focus-link'])
  link.setAttribute('data-archive-openable', 'true')
  link.setAttribute('data-task-id', 'task-123')

  focusesList.click(link)

  expect(window.open).toHaveBeenCalledTimes(1)
  expect(window.open).toHaveBeenCalledWith(
    '/archive-viewer.html?task=task-123',
    '_blank',
    'noopener,noreferrer',
  )
})

test('focus link does not open archive viewer when item is not openable', () => {
  const focusesList = new FakeList()
  bindFocusInteractions(focusesList as unknown as HTMLElement)

  const link = new FakeElement(['focus-link'])
  link.setAttribute('data-archive-openable', 'false')

  focusesList.click(link)

  expect(window.open).not.toHaveBeenCalled()
})

test('warns when popup is blocked', () => {
  const focusesList = new FakeList()
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const openMock = window.open as unknown as ReturnType<typeof vi.fn>
  openMock.mockReturnValueOnce(null)
  bindFocusInteractions(focusesList as unknown as HTMLElement)

  const link = new FakeElement(['focus-link'])
  link.setAttribute('data-archive-openable', 'true')
  link.setAttribute('data-task-id', 'task-456')

  focusesList.click(link)

  expect(warnSpy).toHaveBeenCalledWith(
    '[webui] open focus archive failed',
    'popup blocked',
  )
  warnSpy.mockRestore()
})
