import { afterEach, beforeEach, expect, test } from 'vitest'

import { clearWorkerDots, updateWorkerDots } from '../webui/messages/worker-dots.js'

const originalDocument = globalThis.document

class DotStub {
  className = ''
  title = ''
  dataset: Record<string, string> = {}
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
