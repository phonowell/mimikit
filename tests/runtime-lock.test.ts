import { access, mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test, vi } from 'vitest'

import { acquireRuntimeLock } from '../src/bootstrap/cli/runtime-lock.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-runtime-lock-'))
const require = createRequire(import.meta.url)
const properLockfile = require('proper-lockfile') as {
  lock: (path: string, options: Record<string, unknown>) => Promise<() => Promise<void>>
  check: (path: string, options: Record<string, unknown>) => Promise<boolean>
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test('acquireRuntimeLock blocks concurrent acquire and allows acquire after release', async () => {
  const workDir = await createTmpDir()
  const first = await acquireRuntimeLock(workDir)

  await expect(access(first.path)).resolves.toBeUndefined()
  expect(first.path).toBe(join(workDir, '.instance.lock'))

  await expect(acquireRuntimeLock(workDir)).rejects.toThrow(
    `[cli] instance lock exists at ${join(workDir, '.instance.lock')}`,
  )

  await first.release()
  await expect(access(first.path)).rejects.toMatchObject({ code: 'ENOENT' })
  const second = await acquireRuntimeLock(workDir)
  await second.release()
})

test('acquireRuntimeLock preserves non-lock errors from workdir setup', async () => {
  const root = await createTmpDir()
  const filePath = join(root, 'occupied-by-file')
  await writeFile(filePath, 'x', 'utf8')

  await expect(acquireRuntimeLock(filePath)).rejects.toMatchObject({
    code: 'EEXIST',
  })
})

test('acquireRuntimeLock retries when ELOCKED is reported but lock is already gone', async () => {
  const workDir = await createTmpDir()
  const release = vi.fn(async () => {})
  const lockSpy = vi
    .spyOn(properLockfile, 'lock')
    .mockRejectedValueOnce(
      Object.assign(new Error('Lock file is already being held'), {
        code: 'ELOCKED',
      }),
    )
    .mockResolvedValueOnce(release)
  const checkSpy = vi.spyOn(properLockfile, 'check').mockResolvedValueOnce(false)

  const lock = await acquireRuntimeLock(workDir)

  expect(lock.path).toBe(join(workDir, '.instance.lock'))
  expect(lockSpy).toHaveBeenCalledTimes(2)
  expect(checkSpy).toHaveBeenCalledTimes(1)
  await lock.release()
  expect(release).toHaveBeenCalledTimes(1)
})

test('acquireRuntimeLock waits out a dead-owner stale window before retrying', async () => {
  vi.useFakeTimers()
  const now = new Date('2026-03-25T11:45:35.000Z')
  vi.setSystemTime(now)

  const workDir = await createTmpDir()
  const runtimeDir = join(workDir, 'runtime')
  const lockPath = join(workDir, '.instance.lock')
  await mkdir(runtimeDir, { recursive: true })
  await mkdir(lockPath, { recursive: true })
  await utimes(lockPath, now, now)
  await writeFile(
    join(runtimeDir, 'lease.json'),
    JSON.stringify({
      runtimeId: 'runtime-dead-owner',
      ownerPid: 101,
      updatedAt: now.toISOString(),
    }),
    'utf8',
  )

  const release = vi.fn(async () => {})
  const lockSpy = vi
    .spyOn(properLockfile, 'lock')
    .mockRejectedValueOnce(
      Object.assign(new Error('Lock file is already being held'), {
        code: 'ELOCKED',
      }),
    )
    .mockResolvedValueOnce(release)
  const checkSpy = vi.spyOn(properLockfile, 'check').mockResolvedValueOnce(true)

  const acquirePromise = acquireRuntimeLock(workDir)
  await vi.advanceTimersByTimeAsync(15_100)
  const lock = await acquirePromise

  expect(lock.path).toBe(lockPath)
  expect(lockSpy).toHaveBeenCalledTimes(2)
  expect(checkSpy).toHaveBeenCalledTimes(1)
  await lock.release()
  expect(release).toHaveBeenCalledTimes(1)
})
