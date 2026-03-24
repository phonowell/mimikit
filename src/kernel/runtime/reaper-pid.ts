import { readErrorCode } from '../../foundation/shared/error-code.js'
import { sleep } from '../../foundation/shared/utils.js'

export const isPidAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return readErrorCode(error) === 'EPERM'
  }
}

const waitForPidExit = async (
  pid: number,
  timeoutMs: number,
): Promise<boolean> => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (!isPidAlive(pid)) return true
    await sleep(80)
  }
  return !isPidAlive(pid)
}

export const killPidBestEffort = (params: {
  pid: number
  signal: NodeJS.Signals
  waitMs: number
}): Promise<boolean> => {
  const { pid } = params
  if (!isPidAlive(pid)) return Promise.resolve(true)
  try {
    process.kill(pid, params.signal)
  } catch (error) {
    if (readErrorCode(error) === 'ESRCH') return Promise.resolve(true)
    return Promise.resolve(false)
  }
  if (params.waitMs <= 0) return Promise.resolve(!isPidAlive(pid))
  return waitForPidExit(pid, params.waitMs)
}
