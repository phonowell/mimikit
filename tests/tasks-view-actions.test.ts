import { afterEach, expect, test } from 'vitest'

import { createTaskActions } from '../webui/tasks-view-actions.js'

class FakeElement {
  tagName: string
  children: FakeElement[] = []
  attributes = new Map<string, string>()
  className = ''
  textContent = ''
  disabled = false
  hidden = false
  type = ''

  constructor(tagName: string) {
    this.tagName = tagName
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }

  appendChild(child: FakeElement) {
    this.children.push(child)
    return child
  }
}

const originalDocument = globalThis.document

afterEach(() => {
  if (originalDocument === undefined) delete globalThis.document
  else globalThis.document = originalDocument
})

test('createTaskActions renders inline Continue action for recoverable paused tasks', () => {
  globalThis.document = {
    createElement: (tagName: string) => new FakeElement(tagName),
  } as Document

  const actions = createTaskActions({
    titleText: 'Budget Task',
    taskId: 'task-budget',
    statusValue: 'paused',
    recoverable: true,
  }) as unknown as FakeElement

  const inlineButton = actions.children[0]
  const menu = actions.children[2]
  const primaryMenuButton = menu?.children[0]

  expect(inlineButton?.textContent).toBe('Continue')
  expect(inlineButton?.getAttribute('data-task-action-inline')).toBe('resume')
  expect(primaryMenuButton?.textContent).toBe('continue')
  expect(primaryMenuButton?.disabled).toBe(false)
})

test('createTaskActions skips inline Continue action when paused task is not recoverable', () => {
  globalThis.document = {
    createElement: (tagName: string) => new FakeElement(tagName),
  } as Document

  const actions = createTaskActions({
    titleText: 'Manual Pause',
    taskId: 'task-manual',
    statusValue: 'paused',
    recoverable: false,
  }) as unknown as FakeElement

  expect(actions.children).toHaveLength(2)
  expect(actions.children[0]?.textContent).toBe('⋯')
  expect(actions.children[1]?.children[0]?.textContent).toBe('resume')
})
