import { expect, test, vi } from 'vitest'

import { createControllerViewState } from '../webui/messages/controller-view-state.js'

type TestMessage = {
  id: string
}

const createSubject = ({
  messages = [{ id: 'message-1' }],
  nearBottom = false,
}: {
  messages?: TestMessage[]
  nearBottom?: boolean
} = {}) => {
  const scroll = {
    isNearBottom: vi.fn(() => nearBottom),
    syncAfterLayoutShift: vi.fn(),
  }
  const messageState = {
    lastMessages: messages,
  }
  const quote = {
    clear: vi.fn(),
  }
  const deleteMessages = {
    setDeleteMode: vi.fn(),
  }
  const doRender = vi.fn()

  const viewState = createControllerViewState({
    scroll,
    messageState,
    quote,
    deleteMessages,
    doRender,
  })

  return { viewState, scroll, messageState, quote, deleteMessages, doRender }
}

test('controller view state preserves scroll stickiness across choice panel layout shifts', () => {
  const { viewState, scroll } = createSubject({ messages: [], nearBottom: true })

  viewState.beginChoicePanelLayoutShift()
  viewState.endChoicePanelLayoutShift()
  viewState.endChoicePanelLayoutShift()

  expect(scroll.isNearBottom).toHaveBeenCalledTimes(1)
  expect(scroll.syncAfterLayoutShift).toHaveBeenNthCalledWith(1, { stickToBottom: true })
  expect(scroll.syncAfterLayoutShift).toHaveBeenNthCalledWith(2, { stickToBottom: false })
})

test('controller view state coordinates delete mode and rerenders current messages', () => {
  const { viewState, messageState, quote, deleteMessages, doRender } = createSubject()

  viewState.refreshRenderedTimes()
  expect(doRender).toHaveBeenCalledWith(messageState.lastMessages, expect.any(Set))
  expect((doRender.mock.calls[0]?.[1] as Set<unknown>).size).toBe(0)

  expect(viewState.setDeleteMode(true)).toBe(true)
  expect(viewState.isDeleteMode()).toBe(true)
  expect(deleteMessages.setDeleteMode).toHaveBeenNthCalledWith(1, true)
  expect(quote.clear).toHaveBeenCalledTimes(1)
  expect(doRender).toHaveBeenCalledTimes(2)

  expect(viewState.setDeleteMode(true)).toBe(true)
  expect(deleteMessages.setDeleteMode).toHaveBeenCalledTimes(1)
  expect(doRender).toHaveBeenCalledTimes(2)

  expect(viewState.setDeleteMode(false)).toBe(false)
  expect(viewState.isDeleteMode()).toBe(false)
  expect(deleteMessages.setDeleteMode).toHaveBeenNthCalledWith(2, false)
  expect(quote.clear).toHaveBeenCalledTimes(1)
  expect(doRender).toHaveBeenCalledTimes(3)
})
