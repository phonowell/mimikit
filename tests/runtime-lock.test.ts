import { access, mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { acquireRuntimeLock } from '../src/cli/runtime-lock.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-runtime-lock-'))
const require = createRequire(import.meta.url)
const lockfile = require('proper-lockfile') as {
  lock: (file: string, options: Record<string, unknown>) => Promise<() => Promise<void>>
}

const LOCK_OPTIONS = {
  realpath: false,
  stale: 15_000,
  update: 5_000,
  retries: {
    retries: 6,
    factor: 1.5,
    minTimeout: 20,
    maxTimeout: 500,
  },
} as const

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

test('acquireRuntimeLock blocks concurrent acquire and allows acquire after release', async () => {
  const workDir = await createTmpDir()
  const first = await acquireRuntimeLock(workDir)

  await expect(acquireRuntimeLock(workDir)).rejects.toThrow(
    '[cli] instance lock exists',
  )

  await first.release()
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

test('acquireRuntimeLock rejects startup when legacy lock is active', async () => {
  const workDir = await createTmpDir()
  const legacyLockTarget = join(workDir, '.instance.lock')
  const releaseLegacyLock = await lockfile.lock(legacyLockTarget, LOCK_OPTIONS)

  await expect(acquireRuntimeLock(workDir)).rejects.toThrow(
    `[cli] instance lock exists at ${legacyLockTarget}`,
  )

  await releaseLegacyLock()
})

test('acquireRuntimeLock removes stale legacy lock directory on startup', async () => {
  const workDir = await createTmpDir()
  const legacyLockPath = join(workDir, '.instance.lock.lock')
  await mkdir(legacyLockPath)
  const staleTime = new Date(Date.now() - 60_000)
  await utimes(legacyLockPath, staleTime, staleTime)

  const runtimeLock = await acquireRuntimeLock(workDir)
  expect(await pathExists(legacyLockPath)).toBe(false)
  expect(await pathExists(join(workDir, '.instance.lock'))).toBe(true)
  await runtimeLock.release()
})
