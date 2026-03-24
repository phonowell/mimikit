import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  createEventStreamConnection,
  EVENT_STREAM_STALE_AFTER_MS,
  EVENT_STREAM_STALE_CHECK_MS,
} from '../webui-src/lib/event-stream-connection.js'

type Listener = () => void

class FakeEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static instances: FakeEventSource[] = []

  readonly url: string
  readyState = FakeEventSource.CONNECTING
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  private readonly listeners = new Map<string, Set<(event: { data: string }) => void>>()

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: (event: { data: string }) => void) {
    const existing = this.listeners.get(type) ?? new Set()
    existing.add(listener)
    this.listeners.set(type, existing)
  }

  close() {
    this.closed = true
    this.readyState = FakeEventSource.CLOSED
  }

  emit(type: string, data = '') {
    if (type === 'open') {
      this.readyState = FakeEventSource.OPEN
      this.onopen?.()
      return
    }
    if (type === 'error') {
      this.readyState = FakeEventSource.CONNECTING
      this.onerror?.()
      return
    }
    for (const listener of this.listeners.get(type) ?? []) listener({ data })
  }
}

const createListenerTarget = () => {
  const listeners = new Map<string, Set<Listener>>()
  return {
    addEventListener(type: string, listener: Listener) {
      const existing = listeners.get(type) ?? new Set()
      existing.add(listener)
      listeners.set(type, existing)
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener)
    },
    dispatch(type: string) {
      for (const listener of listeners.get(type) ?? []) listener()
    },
  }
}

describe('createEventStreamConnection', () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const originalEventSource = globalThis.EventSource

  beforeEach(() => {
    vi.useFakeTimers()
    FakeEventSource.instances = []

    const windowTarget = createListenerTarget()
    const documentTarget = createListenerTarget()
    globalThis.window = {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: windowTarget.addEventListener,
      removeEventListener: windowTarget.removeEventListener,
      dispatchEvent: ((event: { type: string }) => {
        windowTarget.dispatch(event.type)
        return true
      }) as typeof window.dispatchEvent,
    } as typeof window
    globalThis.document = {
      visibilityState: 'visible',
      addEventListener: documentTarget.addEventListener,
      removeEventListener: documentTarget.removeEventListener,
      dispatchEvent: ((event: { type: string }) => {
        documentTarget.dispatch(event.type)
        return true
      }) as typeof document.dispatchEvent,
    } as typeof document
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource
  })

  afterEach(() => {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
    globalThis.EventSource = originalEventSource
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  test('heartbeat activity keeps an idle connection from being recycled', () => {
    const connection = createEventStreamConnection({
      onSnapshot: vi.fn(),
      onTasks: vi.fn(),
      onDisconnected: vi.fn(),
    })

    const source = FakeEventSource.instances[0]
    source?.emit('open')

    vi.advanceTimersByTime(EVENT_STREAM_STALE_AFTER_MS - 5_000)
    source?.emit('heartbeat')
    vi.advanceTimersByTime(EVENT_STREAM_STALE_AFTER_MS - 5_000)

    expect(FakeEventSource.instances).toHaveLength(1)
    expect(source?.closed).toBe(false)

    connection.stop()
  })

  test('visibility resume reopens a stale hidden connection that never errored', () => {
    const onDisconnected = vi.fn()
    const connection = createEventStreamConnection({
      onSnapshot: vi.fn(),
      onTasks: vi.fn(),
      onDisconnected,
    })

    const source = FakeEventSource.instances[0]
    source?.emit('open')

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    vi.advanceTimersByTime(
      EVENT_STREAM_STALE_AFTER_MS + EVENT_STREAM_STALE_CHECK_MS + 1_000,
    )

    expect(FakeEventSource.instances).toHaveLength(1)
    expect(source?.closed).toBe(false)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    document.dispatchEvent({ type: 'visibilitychange' } as Event)

    expect(onDisconnected).not.toHaveBeenCalled()
    expect(source?.closed).toBe(true)
    expect(FakeEventSource.instances).toHaveLength(2)

    connection.stop()
  })
})
