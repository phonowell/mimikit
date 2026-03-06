import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { bindFocusInteractions } from '../webui/focus-interactions.js'
import { bindPlanInteractions } from '../webui/plans-interactions.js'

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
    if (!selector.startsWith('.')) return null
    const className = selector.slice(1)
    let cursor: FakeElement | null = this
    while (cursor) {
      if (cursor.#classes.has(className)) return cursor
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

type InteractionCase = {
  bind: (list: HTMLElement) => () => void
  linkClass: string
  warnPrefix: string
}

const interactionCases: InteractionCase[] = [
  {
    bind: bindFocusInteractions,
    linkClass: 'focus-link',
    warnPrefix: '[webui] open focus archive failed',
  },
  {
    bind: bindPlanInteractions,
    linkClass: 'plan-link',
    warnPrefix: '[webui] open plan archive failed',
  },
]

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

test('archive links open archive viewer for openable items', () => {
  const openMock = window.open as unknown as ReturnType<typeof vi.fn>

  for (const item of interactionCases) {
    openMock.mockClear()
    const list = new FakeList()
    item.bind(list as unknown as HTMLElement)
    const link = new FakeElement([item.linkClass])
    link.setAttribute('data-archive-openable', 'true')
    link.setAttribute('data-task-id', 'task-123')

    list.click(link)

    expect(openMock).toHaveBeenCalledTimes(1)
    expect(openMock).toHaveBeenCalledWith(
      '/archive-viewer.html?task=task-123',
      '_blank',
      'noopener,noreferrer',
    )
  }
})

test('archive links do not open for non-openable items', () => {
  const openMock = window.open as unknown as ReturnType<typeof vi.fn>
  const list = new FakeList()
  bindFocusInteractions(list as unknown as HTMLElement)
  const link = new FakeElement(['focus-link'])
  link.setAttribute('data-archive-openable', 'false')

  list.click(link)

  expect(openMock).not.toHaveBeenCalled()
})

test('archive links warn when popup is blocked', () => {
  const openMock = window.open as unknown as ReturnType<typeof vi.fn>
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

  for (const item of interactionCases) {
    warnSpy.mockClear()
    openMock.mockReset()
    openMock.mockReturnValueOnce(null)
    const list = new FakeList()
    item.bind(list as unknown as HTMLElement)
    const link = new FakeElement([item.linkClass])
    link.setAttribute('data-archive-openable', 'true')
    link.setAttribute('data-task-id', 'task-456')

    list.click(link)

    expect(warnSpy).toHaveBeenCalledWith(item.warnPrefix, 'popup blocked')
  }

  warnSpy.mockRestore()
})
