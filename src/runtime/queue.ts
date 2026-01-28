export class SessionQueue {
  private chains = new Map<string, Promise<void>>()

  get size(): number {
    return this.chains.size
  }

  enqueue<T>(sessionKey: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(sessionKey) ?? Promise.resolve()
    const run = previous.then(task, task)
    const next = run.then(
      () => undefined,
      () => undefined,
    )
    this.chains.set(sessionKey, next)
    next.finally(() => {
      if (this.chains.get(sessionKey) === next) this.chains.delete(sessionKey)
    })
    return run
  }
}

export class Semaphore {
  private available: number
  private waiters: Array<() => void> = []

  constructor(capacity: number) {
    this.available = capacity
  }

  acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1
      return Promise.resolve(() => this.release())
    }

    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.available -= 1
        resolve(() => this.release())
      })
    })
  }

  private release(): void {
    this.available += 1
    const next = this.waiters.shift()
    if (next) next()
  }
}
