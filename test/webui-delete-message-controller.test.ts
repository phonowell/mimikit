import { beforeEach, expect, test, vi } from 'vitest'

const {
  createDialogControllerMock,
  dialogOpenMock,
  dialogCloseMock,
  dialogIsOpenMock,
  dialogHandleClickMock,
  dialogHandleCloseMock,
  dialogHandleCancelMock,
  dialogState,
  fetchWithTimeoutMock,
} = vi.hoisted(() => ({
  createDialogControllerMock: vi.fn(),
  dialogOpenMock: vi.fn(),
  dialogCloseMock: vi.fn(),
  dialogIsOpenMock: vi.fn(),
  dialogHandleClickMock: vi.fn(),
  dialogHandleCloseMock: vi.fn(),
  dialogHandleCancelMock: vi.fn(),
  dialogState: { open: false },
  fetchWithTimeoutMock: vi.fn(),
}))

vi.mock('../webui/dialog.js', () => ({
  createDialogController: createDialogControllerMock,
}))

vi.mock('../webui/fetch-with-timeout.js', () => ({
  fetchWithTimeout: fetchWithTimeoutMock,
}))

import { createDeleteMessageController } from '../webui/messages/controller-delete.js'

class ElementStub extends EventTarget {
  disabled = false

  click() {
    this.dispatchEvent(new Event('click', { cancelable: true }))
  }
}

const createDeleteResponse = (status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => ({}),
})

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const createFixture = () => {
  const deleteConfirmDialog = new ElementStub()
  const deleteConfirmCancelBtn = new ElementStub()
  const deleteConfirmBtn = new ElementStub()
  const quote = {
    getActive: vi.fn(() => null),
    clear: vi.fn(),
  }

  const controller = createDeleteMessageController({
    deleteConfirmDialog,
    deleteConfirmCancelBtn,
    deleteConfirmBtn,
    quote,
    messagesEl: null,
    removeEmpty: () => () => {},
    updateScrollButton: () => {},
  })
  controller.bindDialogEvents()

  return {
    controller,
    deleteConfirmCancelBtn,
    deleteConfirmBtn,
  }
}

beforeEach(() => {
  dialogState.open = false
  dialogOpenMock.mockReset()
  dialogOpenMock.mockImplementation(() => {
    dialogState.open = true
  })
  dialogCloseMock.mockReset()
  dialogCloseMock.mockImplementation(() => {
    dialogState.open = false
  })
  dialogIsOpenMock.mockReset()
  dialogIsOpenMock.mockImplementation(() => dialogState.open)
  dialogHandleClickMock.mockReset()
  dialogHandleCloseMock.mockReset()
  dialogHandleCancelMock.mockReset()
  createDialogControllerMock.mockReset()
  createDialogControllerMock.mockImplementation(() => ({
    open: dialogOpenMock,
    close: dialogCloseMock,
    isOpen: dialogIsOpenMock,
    handleDialogClick: dialogHandleClickMock,
    handleDialogClose: dialogHandleCloseMock,
    handleDialogCancel: dialogHandleCancelMock,
  }))
  fetchWithTimeoutMock.mockReset()
  fetchWithTimeoutMock.mockResolvedValue(createDeleteResponse())
})

test('first delete in delete mode requires confirm, later deletes skip confirm', async () => {
  const fixture = createFixture()
  fixture.controller.setDeleteMode(true)

  await fixture.controller.deleteMessage({ id: 'msg-1' })
  expect(dialogOpenMock).toHaveBeenCalledTimes(1)
  expect(fetchWithTimeoutMock).not.toHaveBeenCalled()

  fixture.deleteConfirmBtn.click()
  await flush()
  expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1)
  expect(fetchWithTimeoutMock).toHaveBeenLastCalledWith(
    '/api/messages/msg-1',
    { method: 'DELETE' },
    15000,
  )

  await fixture.controller.deleteMessage({ id: 'msg-2' })
  expect(dialogOpenMock).toHaveBeenCalledTimes(1)
  expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(2)
  expect(fetchWithTimeoutMock).toHaveBeenLastCalledWith(
    '/api/messages/msg-2',
    { method: 'DELETE' },
    15000,
  )
})

test('canceling confirm keeps delete-mode session unconfirmed', async () => {
  const fixture = createFixture()
  fixture.controller.setDeleteMode(true)

  await fixture.controller.deleteMessage({ id: 'msg-1' })
  expect(dialogOpenMock).toHaveBeenCalledTimes(1)

  fixture.deleteConfirmCancelBtn.click()
  expect(dialogCloseMock).toHaveBeenCalledTimes(1)
  expect(fetchWithTimeoutMock).not.toHaveBeenCalled()

  await fixture.controller.deleteMessage({ id: 'msg-2' })
  expect(dialogOpenMock).toHaveBeenCalledTimes(2)
  expect(fetchWithTimeoutMock).not.toHaveBeenCalled()
})

test('exiting and re-entering delete mode resets one-time confirm state', async () => {
  const fixture = createFixture()
  fixture.controller.setDeleteMode(true)

  await fixture.controller.deleteMessage({ id: 'msg-1' })
  fixture.deleteConfirmBtn.click()
  await flush()
  expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1)

  fixture.controller.setDeleteMode(false)
  fixture.controller.setDeleteMode(true)

  await fixture.controller.deleteMessage({ id: 'msg-2' })
  expect(dialogOpenMock).toHaveBeenCalledTimes(2)
  expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1)
})
