type Listener = () => void

export class FakeEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static instances: FakeEventSource[] = []

  readonly url: string
  readyState = FakeEventSource.CONNECTING
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  private readonly listeners = new Map<
    string,
    Set<(event: { data: string }) => void>
  >()

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

export const createListenerTarget = () => {
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
