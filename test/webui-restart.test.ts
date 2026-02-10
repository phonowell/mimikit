import { afterEach, expect, test, vi } from 'vitest'

import { bindRestart } from '../src/webui/restart.js'

type ListenerEvent = {
  preventDefault: () => void
  target?: unknown
}

type Listener = (event: ListenerEvent) => void

class FakeControl {
  disabled = false

  private listeners = new Map<string, Listener[]>()

  private attributes = new Map<string, string>()

  addEventListener(type: string, listener: Listener): void {
    const current = this.listeners.get(type)
    if (current) {
      current.push(listener)
      return
    }
    this.listeners.set(type, [listener])
  }

  dispatch(type: string): void {
    const listeners = this.listeners.get(type)
    if (!listeners) return
    const event: ListenerEvent = {
      preventDefault() {},
      target: this,
    }
    for (const listener of listeners) listener(event)
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  focus(): void {}
}

class FakeDialog extends FakeControl {
  open = false

  classList = {
    contains: (_name: string) => false,
    add: (_name: string) => {},
    remove: (_name: string) => {},
  }

  showModal(): void {
    this.open = true
  }

  close(): void {
    this.open = false
    this.dispatch('close')
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('bindRestart recovers controls when reset request returns non-ok', async () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const fetchMock = vi
    .fn<(input: string, init?: { method?: string }) => Promise<Response>>()
    .mockResolvedValue({ ok: false, status: 500 } as Response)
  vi.stubGlobal('fetch', fetchMock)

  const restartBtn = new FakeControl()
  const restartDialog = new FakeDialog()
  const restartCancelBtn = new FakeControl()
  const restartConfirmBtn = new FakeControl()
  const restartResetBtn = new FakeControl()
  const statusText = { textContent: '' }
  const statusDot = { dataset: { state: '' } }
  const messages = {
    start: vi.fn(),
    stop: vi.fn(),
  }

  bindRestart({
    restartBtn,
    restartDialog,
    restartCancelBtn,
    restartConfirmBtn,
    restartResetBtn,
    statusText,
    statusDot,
    messages,
  })

  restartResetBtn.dispatch('click')
  await Promise.resolve()
  await Promise.resolve()

  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith('/api/reset', { method: 'POST' })
  expect(restartBtn.disabled).toBe(false)
  expect(restartCancelBtn.disabled).toBe(false)
  expect(restartConfirmBtn.disabled).toBe(false)
  expect(restartResetBtn.disabled).toBe(false)
  expect(messages.stop).toHaveBeenCalledTimes(1)
  expect(messages.start).toHaveBeenCalledTimes(1)
  expect(statusText.textContent).toBe('RESET FAILED')
  expect(statusDot.dataset.state).toBe('disconnected')
  expect(warnSpy).toHaveBeenCalledTimes(1)
})
