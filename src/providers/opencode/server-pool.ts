type ClosableServer = {
  close: () => Promise<void>
  refCount: number
  closing?: Promise<void>
  idleTimer?: ReturnType<typeof setTimeout>
}

export type SharedServerLease<TServer extends object> = TServer & ClosableServer

const clearIdleTimer = <TServer extends object>(
  lease: SharedServerLease<TServer>,
): void => {
  if (!lease.idleTimer) return
  clearTimeout(lease.idleTimer)
  delete lease.idleTimer
}

export const createServerPool = <TServer extends object>(params: {
  idleTtlMs: number
}) => {
  const activeByKey = new Map<string, SharedServerLease<TServer>>()
  const pendingByKey = new Map<string, Promise<SharedServerLease<TServer>>>()

  const disposeNow = async (options: {
    key: string
    lease: SharedServerLease<TServer>
  }): Promise<void> => {
    const current = activeByKey.get(options.key)
    if (!current || current !== options.lease) return
    if (current.refCount > 0) return
    if (current.closing) {
      await current.closing
      return
    }
    activeByKey.delete(options.key)
    const closing = current.close()
    current.closing = closing
    try {
      await closing
    } finally {
      if (current.closing === closing) delete current.closing
    }
  }

  const scheduleDispose = (options: {
    key: string
    lease: SharedServerLease<TServer>
  }): void => {
    clearIdleTimer(options.lease)
    options.lease.idleTimer = setTimeout(() => {
      void disposeNow(options)
    }, params.idleTtlMs)
  }

  const acquireServer = async (options: {
    key: string
    create: () => Promise<SharedServerLease<TServer>>
  }): Promise<SharedServerLease<TServer>> => {
    const existing = activeByKey.get(options.key)
    if (existing) {
      clearIdleTimer(existing)
      existing.refCount += 1
      return existing
    }

    const pending = pendingByKey.get(options.key)
    if (pending) {
      const resolved = await pending
      clearIdleTimer(resolved)
      resolved.refCount += 1
      return resolved
    }

    const createPromise = options.create()
    pendingByKey.set(options.key, createPromise)
    try {
      const created = await createPromise
      activeByKey.set(options.key, created)
      return created
    } finally {
      pendingByKey.delete(options.key)
    }
  }

  const releaseServer = (options: { key: string }): void => {
    const current = activeByKey.get(options.key)
    if (!current) return
    current.refCount = Math.max(0, current.refCount - 1)
    if (current.refCount > 0) return
    scheduleDispose({ key: options.key, lease: current })
  }

  return {
    acquireServer,
    releaseServer,
  }
}
