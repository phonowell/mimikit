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

const setup = (confirmDeleteModeEntry: () => boolean) => {
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
    confirmDeleteModeEntry,
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
  const confirmDeleteModeEntry = vi.fn(() => true)
  const context = setup(confirmDeleteModeEntry)

  context.toolsDeleteBtn.click()

  expect(confirmDeleteModeEntry).toHaveBeenCalledTimes(1)
  expect(context.toolsToggleClick).toHaveBeenCalledTimes(1)
  expect(context.messages.setDeleteMode).toHaveBeenCalledTimes(1)
  expect(context.messages.setDeleteMode).toHaveBeenCalledWith(true)
  expect(context.composerSection.hidden).toBe(true)
  expect(context.deleteModeExitSection.hidden).toBe(false)
  expect(context.deleteModeExitBtn.focus).toHaveBeenCalledTimes(1)
})

test('confirmation appears once per entry and reappears after exit', () => {
  const confirmDeleteModeEntry = vi.fn(() => true)
  const context = setup(confirmDeleteModeEntry)

  context.toolsDeleteBtn.click()
  context.toolsDeleteBtn.click()
  expect(confirmDeleteModeEntry).toHaveBeenCalledTimes(1)

  context.deleteModeExitBtn.click()
  context.toolsDeleteBtn.click()

  expect(confirmDeleteModeEntry).toHaveBeenCalledTimes(2)
  expect(context.messages.setDeleteMode.mock.calls).toEqual([
    [true],
    [false],
    [true],
  ])
  expect(context.input.focus).toHaveBeenCalledTimes(1)
})

test('canceling confirmation keeps default mode', () => {
  const confirmDeleteModeEntry = vi.fn(() => false)
  const context = setup(confirmDeleteModeEntry)

  context.toolsDeleteBtn.click()

  expect(confirmDeleteModeEntry).toHaveBeenCalledTimes(1)
  expect(context.messages.setDeleteMode).not.toHaveBeenCalled()
  expect(context.composerSection.hidden).toBe(false)
  expect(context.deleteModeExitSection.hidden).toBe(true)
})
