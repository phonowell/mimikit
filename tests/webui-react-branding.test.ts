import { afterEach, expect, test } from 'vitest'

import {
  type DocumentTitleContext,
  syncDocumentBranding,
} from '../webui-src/lib/branding.js'

import type { StatusSnapshot } from '../webui-src/types.js'

class FakeLinkElement {
  rel = ''
  hrefSetCount = 0
  private hrefValue = ''

  get href() {
    return this.hrefValue
  }

  set href(value: string) {
    this.hrefSetCount += 1
    this.hrefValue = value
  }

  getAttribute(name: string): string | null {
    if (name !== 'href') return null
    return this.hrefValue || null
  }
}

const originalDocument = globalThis.document
const originalHtmlLinkElementDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'HTMLLinkElement',
)

afterEach(() => {
  globalThis.document = originalDocument
  if (originalHtmlLinkElementDescriptor) {
    Object.defineProperty(
      globalThis,
      'HTMLLinkElement',
      originalHtmlLinkElementDescriptor,
    )
    return
  }
  delete (globalThis as { HTMLLinkElement?: unknown }).HTMLLinkElement
})

test('syncDocumentBranding skips redundant favicon writes for identical branding', () => {
  const appended: FakeLinkElement[] = []
  let titleSetCount = 0
  let titleValue = ''
  let existingLink: FakeLinkElement | null = null

  Object.defineProperty(globalThis, 'HTMLLinkElement', {
    configurable: true,
    value: FakeLinkElement,
  })

  const documentMock = {
    querySelector: () => existingLink,
    createElement: () => new FakeLinkElement(),
    head: {
      appendChild: (node: FakeLinkElement) => {
        existingLink = node
        appended.push(node)
        return node
      },
    },
  } as unknown as Document

  Object.defineProperty(documentMock, 'title', {
    configurable: true,
    get: () => titleValue,
    set: (value: string) => {
      titleSetCount += 1
      titleValue = value
    },
  })

  globalThis.document = documentMock

  const status: StatusSnapshot = { agentStatus: 'idle' }
  const context: DocumentTitleContext = {
    confirmDialog: null,
    plansOpen: false,
    tasks: [],
    tasksOpen: false,
  }

  syncDocumentBranding(status, context)
  syncDocumentBranding({ ...status }, { ...context })

  expect(titleValue).toBe('Mimikit')
  expect(titleSetCount).toBe(1)
  expect(appended).toHaveLength(1)
  expect(existingLink?.hrefSetCount).toBe(1)
})
