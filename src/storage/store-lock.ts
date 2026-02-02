import { mkdir, open, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { logSafeError, safe } from '../log/safe.js'

type StoreLockOptions = {
  lockPath?: string
  timeoutMs?: number
  pollIntervalMs?: number
  staleMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_POLL_MS = 25
const DEFAULT_STALE_MS = 30_000

const resolveLockPath = (targetPath: string, override?: string): string => {
  if (override) return override
  if (/\.[a-z0-9]+$/i.test(targetPath)) return `${targetPath}.lock`
  return join(targetPath, '.lock')
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const withStoreLock = async <T>(
  targetPath: string,
  fn: () => Promise<T>,
  opts: StoreLockOptions = {},
): Promise<T> => {
  const lockPath = resolveLockPath(targetPath, opts.lockPath)
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_MS
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS
  const startedAt = Date.now()

  await mkdir(dirname(lockPath), { recursive: true })

  for (;;) {
    try {
      const handle = await open(lockPath, 'wx')
      await safe(
        'withStoreLock: writeFile',
        () =>
          writeFile(
            lockPath,
            JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
            'utf8',
          ),
        { fallback: undefined, meta: { path: lockPath } },
      )
      await handle.close()
      break
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code)
          : null
      if (code !== 'EEXIST') throw error

      const now = Date.now()
      if (now - startedAt > timeoutMs)
        throw new Error(`timeout acquiring store lock: ${lockPath}`)

      try {
        const info = await stat(lockPath)
        if (now - info.mtimeMs > staleMs) {
          await unlink(lockPath)
          continue
        }
      } catch (error) {
        await logSafeError('withStoreLock: stat', error, {
          meta: { path: lockPath },
        })
      }

      await sleep(pollIntervalMs)
    }
  }

  try {
    return await fn()
  } finally {
    await safe('withStoreLock: unlink', () => unlink(lockPath), {
      fallback: undefined,
      meta: { path: lockPath },
    })
  }
}
