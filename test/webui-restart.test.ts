import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const { fetchWithTimeoutMock, delayMock } = vi.hoisted(() => ({
  fetchWithTimeoutMock: vi.fn(),
  delayMock: vi.fn(async () => undefined),
}))

const NON_IDLE_UI_HINT =
  'Restart tools are available only when manager and workers are idle.'

vi.mock('../webui/fetch-with-timeout.js', () => ({
  fetchWithTimeout: fetchWithTimeoutMock,
  delay: delayMock,
}))

import { bindRestart } from '../webui/restart.js'

const originalWindow = globalThis.window
const originalDocument = globalThis.document
const originalNode = globalThis.Node
const originalMutationObserver = globalThis.MutationObserver

class FakeNode {}

class FakeElement extends FakeNode {
  listeners = new Map<string, Set<(event: any) => void>>()
  attributes = new Map<string, string>()
  dataset: Record<string, string> = {}
  classTokenSet = new Set<string>()
  hidden = false
  disabled = false
  open = false
  textContent = ''
  classList = {
    add: (...tokens: string[]) => {
      for (const token of tokens) this.classTokenSet.add(token)
    },
    remove: (...tokens: string[]) => {
      for (const token of tokens) this.classTokenSet.delete(token)
    },
    contains: (token: string) => this.classTokenSet.has(token),
  }

  constructor(title = '') {
    super()
    if (title) this.attributes.set('title', title)
  }

  addEventListener(type: string, handler: (event: any) => void) {
    const handlers = this.listeners.get(type) ?? new Set()
    handlers.add(handler)
    this.listeners.set(type, handlers)
  }

  removeEventListener(type: string, handler: (event: any) => void) {
    const handlers = this.listeners.get(type)
    if (!handlers) return
    handlers.delete(handler)
    if (handlers.size === 0) this.listeners.delete(type)
  }

  dispatchEvent(type: string, init: { key?: string; target?: unknown } = {}) {
    if (type === 'click' && this.disabled) return
    const handlers = [...(this.listeners.get(type) ?? [])]
    const event = {
      type,
      key: init.key,
      target: init.target ?? this,
      preventDefault: vi.fn(),
    }
    for (const handler of handlers) handler(event)
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value))
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
  }

  focus() {}

  contains(node: unknown) {
    return node === this
  }

  showModal() {
    this.open = true
  }

  close() {
    if (!this.open) return
    this.open = false
    this.dispatchEvent('close')
  }
}

class FakeDocument extends FakeNode {
  listeners = new Map<string, Set<(event: any) => void>>()

  addEventListener(type: string, handler: (event: any) => void) {
    const handlers = this.listeners.get(type) ?? new Set()
    handlers.add(handler)
    this.listeners.set(type, handlers)
  }

  removeEventListener(type: string, handler: (event: any) => void) {
    const handlers = this.listeners.get(type)
    if (!handlers) return
    handlers.delete(handler)
    if (handlers.size === 0) this.listeners.delete(type)
  }
}

const installDomStubs = () => {
  const windowStub = {
    matchMedia: () => ({ matches: true }),
    requestAnimationFrame: (callback: (ts?: number) => void) => callback(0),
    setTimeout: (callback: () => void) => {
      callback()
      return 1
    },
    clearTimeout: () => {},
    location: {
      reload: vi.fn(),
    },
  }

  Object.defineProperty(globalThis, 'window', {
    value: windowStub,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'document', {
    value: new FakeDocument(),
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'Node', {
    value: FakeNode,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'MutationObserver', {
    value: class {
      callback: () => void
      constructor(callback: () => void) {
        this.callback = callback
      }
      observe() {}
      disconnect() {}
    },
    configurable: true,
    writable: true,
  })
}

const restoreDomStubs = () => {
  Object.defineProperty(globalThis, 'window', {
    value: originalWindow,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'document', {
    value: originalDocument,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'Node', {
    value: originalNode,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'MutationObserver', {
    value: originalMutationObserver,
    configurable: true,
    writable: true,
  })
}

const createResponse = (payload: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
})

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const createFixture = (
  idle = true,
  { includeResetWithSummaryConfirm = true }: { includeResetWithSummaryConfirm?: boolean } = {},
) => {
  let idleState = idle
  const restartBtn = null
  const toolsToggleBtn = new FakeElement('Tools')
  const toolsMenu = new FakeElement()
  const toolsRestartBtn = new FakeElement('Restart')
  const toolsResetBtn = new FakeElement('Reset')
  const restartDialog = new FakeElement()
  const restartCancelBtn = new FakeElement('Cancel restart')
  const restartConfirmBtn = new FakeElement('Confirm restart')
  const resetDialog = new FakeElement()
  const resetCancelBtn = new FakeElement('Cancel reset')
  const resetWithSummaryConfirmBtn = includeResetWithSummaryConfirm
    ? new FakeElement('Confirm summarize reset')
    : null
  const resetConfirmBtn = new FakeElement('Confirm reset')
  const statusText = new FakeElement()
  const statusDot = new FakeElement()
  statusDot.dataset.state = idle ? 'idle' : 'running'

  const messages = {
    start: vi.fn(),
    stop: vi.fn(),
    isFullyIdle: vi.fn(() => idleState),
  }

  const setIdleState = (nextIdle: boolean) => {
    idleState = nextIdle
    statusDot.dataset.state = nextIdle ? 'idle' : 'running'
    messages.isFullyIdle.mockImplementation(() => idleState)
  }

  const binding = bindRestart({
    restartBtn,
    toolsToggleBtn,
    toolsMenu,
    toolsRestartBtn,
    toolsResetBtn,
    restartDialog,
    restartCancelBtn,
    restartConfirmBtn,
    resetDialog,
    resetCancelBtn,
    resetWithSummaryConfirmBtn,
    resetConfirmBtn,
    statusText,
    statusDot,
    messages,
  })

  return {
    restartBtn,
    toolsToggleBtn,
    toolsMenu,
    toolsRestartBtn,
    toolsResetBtn,
    restartDialog,
    restartCancelBtn,
    restartConfirmBtn,
    resetDialog,
    resetCancelBtn,
    resetWithSummaryConfirmBtn,
    resetConfirmBtn,
    statusText,
    statusDot,
    messages,
    setIdleState,
    dispose: () => binding?.dispose?.(),
  }
}

beforeEach(() => {
  installDomStubs()
  fetchWithTimeoutMock.mockReset()
  delayMock.mockReset()
  delayMock.mockResolvedValue(undefined)
})

afterEach(() => {
  restoreDomStubs()
})

test('non-idle state disables tools actions and exposes reason via tooltip', () => {
  const fixture = createFixture(false)
  try {
    expect(fixture.toolsRestartBtn.disabled).toBe(true)
    expect(fixture.toolsResetBtn.disabled).toBe(true)
    expect(fixture.toolsToggleBtn.getAttribute('title')).toBe(NON_IDLE_UI_HINT)
    expect(fixture.toolsRestartBtn.getAttribute('title')).toBe(NON_IDLE_UI_HINT)
    expect(fixture.toolsResetBtn.getAttribute('title')).toBe(NON_IDLE_UI_HINT)

    fixture.toolsRestartBtn.dispatchEvent('click')
    fixture.toolsResetBtn.dispatchEvent('click')

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(0)
  } finally {
    fixture.dispose()
  }
})

test('restart and reset dialogs are isolated', () => {
  const fixture = createFixture(true)
  try {
    fixture.toolsRestartBtn.dispatchEvent('click')
    expect(fixture.restartDialog.open).toBe(true)
    expect(fixture.resetDialog.open).toBe(false)

    fixture.toolsResetBtn.dispatchEvent('click')
    expect(fixture.resetDialog.open).toBe(true)
    expect(fixture.restartDialog.open).toBe(false)
  } finally {
    fixture.dispose()
  }
})

test('reset dialog still opens when summarize-reset confirm is unavailable', () => {
  const fixture = createFixture(true, { includeResetWithSummaryConfirm: false })
  try {
    fixture.toolsResetBtn.dispatchEvent('click')
    expect(fixture.resetDialog.open).toBe(true)
    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(0)
  } finally {
    fixture.dispose()
  }
})

test('restart and reset dialog confirm actions call separate endpoints', async () => {
  const calledUrls: string[] = []
  const runtimeIds = [
    'runtime-1',
    'runtime-2',
    'runtime-3',
    'runtime-4',
    'runtime-5',
    'runtime-6',
  ]
  fetchWithTimeoutMock.mockImplementation(async (url) => {
    calledUrls.push(String(url))
    if (url === '/api/status') {
      const runtimeId = runtimeIds.shift() ?? 'runtime-last'
      return createResponse({
        runtimeId,
        managerRunning: false,
        activeTasks: 0,
        pendingTasks: 0,
      })
    }
    if (
      url === '/api/restart' ||
      url === '/api/reset' ||
      url === '/api/reset-with-summary'
    )
      return createResponse({ ok: true })
    throw new Error(`unexpected url: ${String(url)}`)
  })

  const restartFixture = createFixture(true)
  const summaryResetFixture = createFixture(true)
  const resetFixture = createFixture(true)
  try {
    restartFixture.toolsRestartBtn.dispatchEvent('click')
    restartFixture.restartConfirmBtn.dispatchEvent('click')
    await flush()

    summaryResetFixture.toolsResetBtn.dispatchEvent('click')
    summaryResetFixture.resetWithSummaryConfirmBtn.dispatchEvent('click')
    await flush()

    resetFixture.toolsResetBtn.dispatchEvent('click')
    resetFixture.resetConfirmBtn.dispatchEvent('click')
    await flush()

    expect(calledUrls.filter((url) => url === '/api/restart')).toHaveLength(1)
    expect(calledUrls.filter((url) => url === '/api/reset-with-summary')).toHaveLength(1)
    expect(calledUrls.filter((url) => url === '/api/reset')).toHaveLength(1)
  } finally {
    restartFixture.dispose()
    summaryResetFixture.dispose()
    resetFixture.dispose()
  }
})

test('restart request is hard-blocked by preflight when status is not idle', async () => {
  const calledUrls: string[] = []
  fetchWithTimeoutMock.mockImplementation(async (url) => {
    calledUrls.push(String(url))
    if (url === '/api/status') {
      return createResponse({
        runtimeId: 'runtime-busy-1',
        managerRunning: true,
        activeTasks: 1,
        pendingTasks: 0,
      })
    }
    if (url === '/api/restart') return createResponse({ ok: true })
    throw new Error(`unexpected url: ${String(url)}`)
  })

  const fixture = createFixture(true)
  try {
    fixture.toolsRestartBtn.dispatchEvent('click')
    fixture.restartConfirmBtn.dispatchEvent('click')
    await flush()

    expect(calledUrls).toEqual(['/api/status'])
    expect(fixture.statusText.textContent).toContain('RESTART BLOCKED')
    expect(fixture.messages.stop).toHaveBeenCalledTimes(1)
    expect(fixture.messages.start).toHaveBeenCalledTimes(1)
  } finally {
    fixture.dispose()
  }
})

test('reset request is hard-blocked by preflight when status is not idle', async () => {
  const calledUrls: string[] = []
  fetchWithTimeoutMock.mockImplementation(async (url) => {
    calledUrls.push(String(url))
    if (url === '/api/status') {
      return createResponse({
        runtimeId: 'runtime-busy-2',
        managerRunning: false,
        activeTasks: 0,
        pendingTasks: 2,
      })
    }
    if (url === '/api/reset') return createResponse({ ok: true })
    throw new Error(`unexpected url: ${String(url)}`)
  })

  const fixture = createFixture(true)
  try {
    fixture.toolsResetBtn.dispatchEvent('click')
    fixture.resetConfirmBtn.dispatchEvent('click')
    await flush()

    expect(calledUrls).toEqual(['/api/status'])
    expect(fixture.statusText.textContent).toContain('RESET BLOCKED')
    expect(fixture.messages.stop).toHaveBeenCalledTimes(1)
    expect(fixture.messages.start).toHaveBeenCalledTimes(1)
  } finally {
    fixture.dispose()
  }
})
