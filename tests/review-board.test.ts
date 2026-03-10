import { afterEach, expect, test } from 'vitest'

import { UI_TEXT } from '../webui/system-text.js'
import { bindReviewStatusPanel } from '../webui/review-board.js'

class FakeClassList {
  values = new Set<string>()

  add(...names: string[]) {
    names.forEach((name) => this.values.add(name))
  }

  remove(...names: string[]) {
    names.forEach((name) => this.values.delete(name))
  }

  contains(name: string) {
    return this.values.has(name)
  }
}

class FakeElement {
  tagName: string
  attributes = new Map<string, string>()
  children: FakeElement[] = []
  className = ''
  classList = new FakeClassList()
  dataset: Record<string, string> = {}
  disabled = false
  innerHtmlValue = ''
  open = false
  textContent = ''
  type = ''
  listeners = new Map<string, Set<(event?: Event) => void>>()

  constructor(tagName: string) {
    this.tagName = tagName
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }

  get innerHTML() {
    return this.innerHtmlValue
  }

  set innerHTML(value: string) {
    this.innerHtmlValue = value
    if (value === '') this.children = []
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
  }

  addEventListener(type: string, listener: (event?: Event) => void) {
    const handlers = this.listeners.get(type) ?? new Set()
    handlers.add(listener)
    this.listeners.set(type, handlers)
  }

  removeEventListener(type: string, listener: (event?: Event) => void) {
    this.listeners.get(type)?.delete(listener)
  }

  appendChild(child: FakeElement) {
    this.children.push(child)
    return child
  }

  append(...children: FakeElement[]) {
    children.forEach((child) => {
      this.appendChild(child)
    })
  }

  replaceChildren(...children: FakeElement[]) {
    this.innerHtmlValue = ''
    this.children = [...children]
  }

  focus() {}

  close() {
    this.open = false
  }

  showModal() {
    this.open = true
  }
}

const originalDocument = globalThis.document
const originalHTMLElement = globalThis.HTMLElement

afterEach(() => {
  if (originalDocument === undefined) delete globalThis.document
  else globalThis.document = originalDocument

  if (originalHTMLElement === undefined) delete globalThis.HTMLElement
  else globalThis.HTMLElement = originalHTMLElement
})

test('bindReviewStatusPanel clears stale cards and shows disconnected summary', () => {
  globalThis.HTMLElement = FakeElement as unknown as typeof HTMLElement
  globalThis.document = {
    createElement: (tagName: string) => new FakeElement(tagName),
  } as Document

  const dialog = new FakeElement('dialog') as unknown as HTMLElement
  const openBtn = new FakeElement('button') as unknown as HTMLElement
  const closeBtn = new FakeElement('button') as unknown as HTMLElement
  const summaryEl = new FakeElement('span') as unknown as HTMLElement
  const cardsEl = new FakeElement('div') as unknown as HTMLElement
  const actionsEl = new FakeElement('div') as unknown as HTMLElement
  const highlightsEl = new FakeElement('ul') as unknown as HTMLElement

  const panel = bindReviewStatusPanel({
    dialog,
    openBtn,
    closeBtn,
    summaryEl,
    cardsEl,
    actionsEl,
    highlightsEl,
  })

  panel.applySnapshot({
    cards: [{ id: 'recoverable', label: 'Recoverable', value: 2 }],
    highlights: [{ id: 'h-1', title: 'Needs review', detail: 'Recoverable tasks pending.' }],
  })

  expect((summaryEl as unknown as FakeElement).textContent).toBe('Recoverable 2')
  expect((cardsEl as unknown as FakeElement).children).toHaveLength(1)

  panel.setDisconnected()

  expect((summaryEl as unknown as FakeElement).textContent).toBe(UI_TEXT.connectionLost)
  expect((openBtn as unknown as FakeElement).getAttribute('title')).toBe(
    'Review status · Connection lost',
  )
  expect((cardsEl as unknown as FakeElement).children).toHaveLength(0)
  expect(
    (highlightsEl as unknown as FakeElement).children[0]?.children[0]?.textContent,
  ).toBe(UI_TEXT.connectionLost)
})
