import { createRequire } from 'node:module'

import { ensureFile } from '../fs/paths.js'
import { logSafeError } from '../log/safe.js'

type LockRelease = () => Promise<void>

const require = createRequire(import.meta.url)
const lockfile = require('proper-lockfile') as {
  lock: (file: string, options: Record<string, unknown>) => Promise<LockRelease>
}
const updateQueue = new Map<string, Promise<void>>()

const LOCK_OPTIONS = {
  realpath: false,
  stale: 10_000,
  update: 2_000,
  retries: {
    retries: 8,
    factor: 1.5,
    minTimeout: 20,
    maxTimeout: 500,
  },
} as const

export const runSerialized = async <T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const previous = updateQueue.get(key) ?? Promise.resolve()
  const safePrevious = previous.catch((error) =>
    logSafeError('runSerialized:previous_failed', error, { meta: { key } }),
  )
  let releaseQueue!: () => void
  const next = new Promise<void>((resolve) => {
    releaseQueue = resolve
  })
  updateQueue.set(key, next)
  await safePrevious
  const lockPath = `${key}.lock`
  await ensureFile(lockPath, '')
  const releaseLock = await lockfile.lock(lockPath, LOCK_OPTIONS)
  try {
    return await fn()
  } finally {
    await releaseLock()
    releaseQueue()
    if (updateQueue.get(key) === next) updateQueue.delete(key)
  }
}
