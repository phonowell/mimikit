import { beforeEach, expect, test, vi } from 'vitest'

const { fetchWithTimeoutMock, renderErrorMock } = vi.hoisted(() => ({
  fetchWithTimeoutMock: vi.fn(),
  renderErrorMock: vi.fn(),
}))

vi.mock('../webui/fetch-with-timeout.js', () => ({
  fetchWithTimeout: fetchWithTimeoutMock,
}))

vi.mock('../webui/messages/render-list.js', () => ({
  renderError: renderErrorMock,
}))

import { createSendHandler } from '../webui/messages/send.js'

class ControlStub extends EventTarget {
  disabled = false
}

class InputStub extends EventTarget {
  disabled = false

  value = 'draft'

  focus = vi.fn()
}

const createFixture = () => {
  const sendBtn = new ControlStub()
  const input = new InputStub()
  const messageState = { awaitingReply: false }
  const loading = {
    setLoading: vi.fn(),
  }
  const quote = {
    getActive: vi.fn(() => null),
    clear: vi.fn(),
  }
  const scroll = {
    updateScrollButton: vi.fn(),
  }

  const handler = createSendHandler({
    sendBtn,
    input,
    messageState,
    loading,
    quote,
    scroll,
    messagesEl: {},
    removeEmpty: vi.fn(),
  })

  return {
    sendBtn,
    input,
    messageState,
    loading,
    quote,
    handler,
  }
}

beforeEach(() => {
  fetchWithTimeoutMock.mockReset()
  renderErrorMock.mockReset()
})

test('submit disables controls during request and enters loading on success', async () => {
  let resolveRequest: ((value: { ok: boolean }) => void) | undefined
  fetchWithTimeoutMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
  )

  const fixture = createFixture()
  const submit = fixture.handler('  hello  ')

  expect(fixture.sendBtn.disabled).toBe(true)
  expect(fixture.input.disabled).toBe(true)
  expect(fixture.messageState.awaitingReply).toBe(true)

  resolveRequest?.({ ok: true })
  await submit

  expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1)
  expect(fixture.quote.clear).toHaveBeenCalledTimes(1)
  expect(fixture.loading.setLoading).toHaveBeenCalledWith(true)
  expect(fixture.sendBtn.disabled).toBe(false)
  expect(fixture.input.disabled).toBe(false)
  expect(fixture.input.focus).toHaveBeenCalledTimes(1)
})

test('failed submit exits loading and keeps controls reusable', async () => {
  fetchWithTimeoutMock.mockRejectedValue(new Error('network down'))
  const fixture = createFixture()

  await fixture.handler('hello')

  expect(renderErrorMock).toHaveBeenCalledTimes(1)
  expect(fixture.loading.setLoading).toHaveBeenCalledWith(false)
  expect(fixture.messageState.awaitingReply).toBe(false)
  expect(fixture.sendBtn.disabled).toBe(false)
  expect(fixture.input.disabled).toBe(false)
})
