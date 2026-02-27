import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { FileHandle } from 'node:fs/promises'

import { bestEffort, logSafeError } from '../log/safe.js'
import { readErrorCode } from '../shared/error-code.js'

type LockRecord = {
  pid: number
  token: string
  createdAt: string
}

export type RuntimeLock = {
  path: string
  release: () => Promise<void>
}

const LOCK_FILE_NAME = '.instance.lock'

const readLockRecord = async (
  path: string,
): Promise<LockRecord | undefined> => {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as Partial<LockRecord>
    if (
      typeof parsed.pid !== 'number' ||
      !Number.isInteger(parsed.pid) ||
      parsed.pid <= 0
    )
      return undefined
    if (typeof parsed.token !== 'string' || parsed.token.trim().length === 0)
      return undefined
    if (
      typeof parsed.createdAt !== 'string' ||
      parsed.createdAt.trim().length === 0
    )
      return undefined
    return {
      pid: parsed.pid,
      token: parsed.token,
      createdAt: parsed.createdAt,
    }
  } catch (error) {
    if (readErrorCode(error) === 'ENOENT') return undefined
    await logSafeError('runtime_lock:read_lock_record', error, {
      meta: { path },
    })
    return undefined
  }
}

const isPidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = readErrorCode(error) ?? ''
    if (code === 'EPERM') return true
    return false
  }
}

const writeLockRecord = async (
  handle: FileHandle,
  record: LockRecord,
): Promise<void> => {
  const payload = `${JSON.stringify(record)}\n`
  await handle.writeFile(payload, { encoding: 'utf8' })
}

const acquireFreshLock = async (
  path: string,
): Promise<{
  handle: FileHandle
  token: string
}> => {
  const handle = await open(path, 'wx')
  const token = randomUUID()
  await writeLockRecord(handle, {
    pid: process.pid,
    token,
    createdAt: new Date().toISOString(),
  })
  return { handle, token }
}

export const acquireRuntimeLock = async (
  workDir: string,
): Promise<RuntimeLock> => {
  await mkdir(workDir, { recursive: true })
  const lockPath = join(workDir, LOCK_FILE_NAME)

  let handle: FileHandle | undefined
  let token = ''
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const acquired = await acquireFreshLock(lockPath)
      handle = acquired.handle
      token = acquired.token
      break
    } catch (error) {
      const code = readErrorCode(error) ?? ''
      if (code !== 'EEXIST') throw error
      const record = await readLockRecord(lockPath)
      const stale = !record || !isPidAlive(record.pid)
      if (!stale) {
        throw new Error(
          `[cli] instance lock exists at ${lockPath} (pid ${record.pid})`,
        )
      }
      await rm(lockPath, { force: true })
    }
  }
  if (!handle || !token)
    throw new Error(`[cli] failed to acquire instance lock at ${lockPath}`)

  let released = false
  return {
    path: lockPath,
    release: async () => {
      if (released) return
      released = true
      await bestEffort('runtime_lock:close_handle', () => handle.close(), {
        meta: { lockPath },
      })
      const record = await readLockRecord(lockPath)
      if (record?.token === token)
        await bestEffort(
          'runtime_lock:remove_lock_file',
          () => rm(lockPath, { force: true }),
          { meta: { lockPath } },
        )
    },
  }
}
