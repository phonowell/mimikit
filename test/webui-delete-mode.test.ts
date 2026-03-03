import { expect, test, vi } from 'vitest'

import { bindDeleteMode } from '../webui/delete-mode.js'

class ElementStub extends EventTarget {
  hidden = false
  disabled = false
  #attributes = new Map<string, string>()
  focus = vi.fn()

  setAttribute(name: string, value: string) {
    this.#attributes.set(name, String(value))
  }

  getAttribute(name: string) {
    return this.#attributes.get(name) ?? null
  }

  click() {
    this.dispatchEvent(new Event('click', { cancelable: true }))
  }
}

const setup = () => {
  const toolsDeleteBtn = new ElementStub()
  const toolsToggleBtn = new ElementStub()
  const composerSection = new ElementStub()
  const deleteModeExitSection = new ElementStub()
  const deleteModeExitBtn = new ElementStub()
  const input = new ElementStub()
  const messages = {
    setDeleteMode: vi.fn(),
  }

  toolsToggleBtn.setAttribute('aria-expanded', 'true')
  const toolsToggleClick = vi
    .spyOn(toolsToggleBtn, 'click')
    .mockImplementation(() => {
      toolsToggleBtn.setAttribute('aria-expanded', 'false')
    })

  bindDeleteMode({
    toolsDeleteBtn,
    toolsToggleBtn,
    composerSection,
    deleteModeExitSection,
    deleteModeExitBtn,
    input,
    messages,
  })

  return {
    toolsDeleteBtn,
    toolsToggleBtn,
    toolsToggleClick,
    composerSection,
    deleteModeExitSection,
    deleteModeExitBtn,
    input,
    messages,
  }
}

test('entering delete mode toggles composer/exit sections', () => {
  const context = setup()

  context.toolsDeleteBtn.click()

  expect(context.toolsToggleClick).toHaveBeenCalledTimes(1)
  expect(context.messages.setDeleteMode).toHaveBeenCalledTimes(1)
  expect(context.messages.setDeleteMode).toHaveBeenCalledWith(true)
  expect(context.composerSection.hidden).toBe(true)
  expect(context.deleteModeExitSection.hidden).toBe(false)
  expect(context.deleteModeExitBtn.focus).toHaveBeenCalledTimes(1)
})

test('tools delete menu item toggles delete mode on repeated clicks', () => {
  const context = setup()

  context.toolsDeleteBtn.click()
  context.toolsDeleteBtn.click()
  context.toolsDeleteBtn.click()

  expect(context.messages.setDeleteMode.mock.calls).toEqual([
    [true],
    [false],
    [true],
  ])
  expect(context.input.focus).toHaveBeenCalledTimes(1)
})

test('disabled delete mode trigger does not enter delete mode', () => {
  const context = setup()
  context.toolsDeleteBtn.disabled = true

  context.toolsDeleteBtn.click()

  expect(context.messages.setDeleteMode).not.toHaveBeenCalled()
  expect(context.composerSection.hidden).toBe(false)
  expect(context.deleteModeExitSection.hidden).toBe(true)
})
