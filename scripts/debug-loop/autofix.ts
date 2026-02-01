import type { LogEntry } from './types.js'
import { parseTimestamp } from './utils.js'

export const createAbortHandler = (params: {
  threshold: number
  windowMs: number
  autoFix: boolean
  restartCooldownMs: number
  timeoutStepMs: number
  timeoutMaxMs: number
  dedupeMs?: number
  getTimeout: () => number
  setTimeout: (value: number) => void
  onRestart: () => Promise<void>
  writeReport: (payload: Record<string, unknown>) => Promise<void>
  log: (message: string) => void
}) => {
  const abortTimestamps: number[] = []
  let lastRestartAt = 0
  const lastAbortByRole = new Map<string, number>()
  const dedupeMs = params.dedupeMs ?? 2000

  const trimWindow = (nowMs: number) => {
    const cutoff = nowMs - params.windowMs
    while (abortTimestamps.length > 0 && abortTimestamps[0] < cutoff)
      abortTimestamps.shift()
  }

  const triggerFix = async (entry: LogEntry) => {
    const nowMs = Date.now()
    if (nowMs - lastRestartAt < params.restartCooldownMs) {
      params.log('restart suppressed (cooldown)')
      return
    }
    const currentTimeout = params.getTimeout()
    const nextTimeout = Math.min(
      currentTimeout + params.timeoutStepMs,
      params.timeoutMaxMs,
    )
    if (nextTimeout === currentTimeout) {
      params.log('timeout already at max; skip auto-fix')
      return
    }
    params.setTimeout(nextTimeout)
    lastRestartAt = nowMs
    await params.writeReport({
      reason: 'llm_abort_threshold',
      abortCount: abortTimestamps.length,
      threshold: params.threshold,
      windowMs: params.windowMs,
      timeoutBefore: currentTimeout,
      timeoutAfter: nextTimeout,
      entry,
    })
    params.log(`auto-fix: timeout ${currentTimeout} -> ${nextTimeout}, restarting`)
    await params.onRestart()
  }

  const handleEntry = async (entry: LogEntry) => {
    const event = entry.event ?? ''
    if (
      event !== 'llm_call_aborted' &&
      event !== 'llm_call_failed' &&
      event !== 'llm_error'
    )
      return
    const isAbort =
      entry.aborted === true ||
      entry.errorName === 'AbortError' ||
      (typeof entry.error === 'string' &&
        entry.error.toLowerCase().includes('aborted'))
    if (!isAbort) return
    const ts = parseTimestamp(entry.timestamp)
    const role = entry.role ?? 'unknown'
    const lastAbort = lastAbortByRole.get(role)
    if (lastAbort !== undefined && Math.abs(ts - lastAbort) <= dedupeMs) return
    lastAbortByRole.set(role, ts)
    abortTimestamps.push(ts)
    trimWindow(Date.now())
    params.log(`abort detected (${abortTimestamps.length}/${params.threshold})`)
    if (params.autoFix && abortTimestamps.length >= params.threshold) {
      await triggerFix(entry)
      abortTimestamps.length = 0
    }
  }

  return { handleEntry }
}
