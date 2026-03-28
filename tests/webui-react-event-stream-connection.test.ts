import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  createEventStreamConnection,
  EVENT_STREAM_STALE_AFTER_MS,
  EVENT_STREAM_STALE_CHECK_MS,
} from '../webui-src/lib/event-stream-connection.js'

import {
  createListenerTarget,
  FakeEventSource,
} from './helpers/webui-event-source.js'

import type { FocusesSnapshot, PlansSnapshot } from '../webui-src/types.js'

describe('createEventStreamConnection', () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const originalEventSource = globalThis.EventSource

  beforeEach(() => {
    vi.useFakeTimers()
    FakeEventSource.instances = []

    const windowTarget = createListenerTarget()
    const documentTarget = createListenerTarget()
    const windowMock: typeof window = {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: windowTarget.addEventListener,
      removeEventListener: windowTarget.removeEventListener,
      dispatchEvent: (event: Event) => {
        windowTarget.dispatch(event.type)
        return true
      },
    }
    const documentMock: typeof document = {
      visibilityState: 'visible',
      addEventListener: documentTarget.addEventListener,
      removeEventListener: documentTarget.removeEventListener,
      dispatchEvent: (event: Event) => {
        documentTarget.dispatch(event.type)
        return true
      },
    }
    const eventSourceCtor: typeof EventSource = FakeEventSource
    globalThis.window = windowMock
    globalThis.document = documentMock
    globalThis.EventSource = eventSourceCtor
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
      onPlans: vi.fn(),
      onFocuses: vi.fn(),
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
      onPlans: vi.fn(),
      onFocuses: vi.fn(),
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

  test('plans and focuses events dispatch their domain payloads', () => {
    const onPlans = vi.fn<(plans: PlansSnapshot) => void>()
    const onFocuses = vi.fn<(focuses: FocusesSnapshot) => void>()
    const connection = createEventStreamConnection({
      onSnapshot: vi.fn(),
      onTasks: vi.fn(),
      onPlans,
      onFocuses,
      onDisconnected: vi.fn(),
    })

    const source = FakeEventSource.instances[0]
    source?.emit('open')
    source?.emit('plans', JSON.stringify({ items: [{ id: 'plan-1' }] }))
    source?.emit('focuses', JSON.stringify({ items: [{ id: 'focus-1' }] }))

    expect(onPlans).toHaveBeenCalledWith({ items: [{ id: 'plan-1' }] })
    expect(onFocuses).toHaveBeenCalledWith({ items: [{ id: 'focus-1' }] })

    connection.stop()
  })
})
