import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { clearWorkerDots, updateWorkerDots } from '../webui/messages/worker-dots.js'

const originalDocument = globalThis.document

type EventHandler = (event: Event) => void

class DotStub {
  className = ''
  title = ''
  dataset: Record<string, string> = {}
  readonly classTokenSet = new Set<string>()
  readonly listeners = new Map<string, Set<EventHandler>>()
  readonly classList = {
    add: (...tokens: string[]) => {
      for (const token of tokens) this.classTokenSet.add(token)
    },
    remove: (...tokens: string[]) => {
      for (const token of tokens) this.classTokenSet.delete(token)
    },
    contains: (token: string) => this.classTokenSet.has(token),
  }

  get offsetWidth() {
    return 6
  }

  addEventListener(type: string, handler: EventHandler) {
    const handlers = this.listeners.get(type) ?? new Set<EventHandler>()
    handlers.add(handler)
    this.listeners.set(type, handlers)
  }

  dispatchEvent(event: Event) {
    const handlers = [...(this.listeners.get(event.type) ?? [])]
    for (const handler of handlers) handler(event)
    return true
  }
}

class WorkerDotsStub {
  title = ''
  dataset: Record<string, string> = {}
  attributes = new Map<string, string>()
  private dots: DotStub[] = []

  set innerHTML(value: string) {
    if (value === '') this.dots = []
  }

  get innerHTML() {
    return this.dots.map(() => '<span class="worker-dot"></span>').join('')
  }

  appendChild(dot: DotStub) {
    this.dots.push(dot)
  }

  querySelectorAll(selector: string) {
    if (selector !== '.worker-dot') return []
    return this.dots
  }

  removeAttribute(name: string) {
    if (name === 'title') {
      this.title = ''
      return
    }
    this.attributes.delete(name)
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'document', {
    value: {
      createElement: () => new DotStub(),
    },
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'document', {
    value: originalDocument,
    configurable: true,
    writable: true,
  })
})

test('worker slot dot transition runs only on state change', () => {
  const workerDots = new WorkerDotsStub()

  updateWorkerDots(workerDots, {
    agentStatus: 'idle',
    activeTasks: 0,
    maxWorkers: 1,
  })
  const dot = workerDots.querySelectorAll('.worker-dot')[0]
  expect(dot.dataset.state).toBe('idle')
  expect(dot.classList.contains('worker-dot--state-transition')).toBe(false)

  updateWorkerDots(workerDots, {
    agentStatus: 'running',
    activeTasks: 1,
    maxWorkers: 1,
  })
  expect(dot.dataset.state).toBe('running')
  expect(dot.dataset.transition).toBe('engage')
  expect(dot.classList.contains('worker-dot--state-transition')).toBe(true)

  dot.dispatchEvent(new Event('animationend'))
  expect(dot.classList.contains('worker-dot--state-transition')).toBe(false)
  expect(dot.dataset.transition).toBeUndefined()

  updateWorkerDots(workerDots, {
    agentStatus: 'running',
    activeTasks: 1,
    maxWorkers: 1,
  })
  expect(dot.dataset.state).toBe('running')
  expect(dot.classList.contains('worker-dot--state-transition')).toBe(false)

  updateWorkerDots(workerDots, {
    agentStatus: 'idle',
    activeTasks: 0,
    maxWorkers: 1,
  })
  expect(dot.dataset.state).toBe('idle')
  expect(dot.dataset.transition).toBe('release')
  expect(dot.classList.contains('worker-dot--state-transition')).toBe(true)
})

test('disconnected status maps dot state to disconnected', () => {
  const workerDots = new WorkerDotsStub()

  updateWorkerDots(workerDots, {
    agentStatus: 'idle',
    activeTasks: 0,
    maxWorkers: 2,
  })
  updateWorkerDots(workerDots, {
    agentStatus: 'disconnected',
    activeTasks: 0,
    maxWorkers: 2,
  })

  const dots = workerDots.querySelectorAll('.worker-dot')
  expect(dots).toHaveLength(2)
  expect(dots[0]?.dataset.state).toBe('disconnected')
  expect(dots[1]?.dataset.state).toBe('disconnected')
  expect(workerDots.title).toBe('disconnected 0/2 running')
})

test('worker slot transition auto-clears after pulse window', () => {
  vi.useFakeTimers()
  try {
    const workerDots = new WorkerDotsStub()

    updateWorkerDots(workerDots, {
      agentStatus: 'idle',
      activeTasks: 0,
      maxWorkers: 1,
    })
    updateWorkerDots(workerDots, {
      agentStatus: 'running',
      activeTasks: 1,
      maxWorkers: 1,
    })

    const dot = workerDots.querySelectorAll('.worker-dot')[0]
    expect(dot.classList.contains('worker-dot--state-transition')).toBe(true)

    vi.advanceTimersByTime(3000)
    expect(dot.classList.contains('worker-dot--state-transition')).toBe(true)

    vi.advanceTimersByTime(120)
    expect(dot.classList.contains('worker-dot--state-transition')).toBe(false)
    expect(dot.dataset.transition).toBeUndefined()
  } finally {
    vi.useRealTimers()
  }
})

test('clearWorkerDots resets rendered dots and slot count cache', () => {
  const workerDots = new WorkerDotsStub()
  workerDots.dataset.slotCount = '3'
  updateWorkerDots(workerDots, {
    agentStatus: 'idle',
    activeTasks: 0,
    maxWorkers: 3,
  })

  clearWorkerDots(workerDots)

  expect(workerDots.querySelectorAll('.worker-dot')).toHaveLength(0)
  expect(workerDots.dataset.slotCount).toBeUndefined()
  expect(workerDots.title).toBe('')
})

test('reduced motion disables worker dot transition animation in css', () => {
  const css = readFileSync(
    new URL('../webui/components-responsive.css', import.meta.url),
    'utf8',
  )

  expect(css).toMatch(
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.tasks-worker-dots \.worker-dot\.worker-dot--state-transition(?:,\s*\.tasks-worker-dots \.worker-dot\.worker-dot--state-transition::after)?\s*\{\s*animation: none;/,
  )
})
