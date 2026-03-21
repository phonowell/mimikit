import { delay, fetchWithTimeout } from './fetch-with-timeout.js'
import {
  MODE_BLOCKED_LABEL,
  MODE_ENDPOINT,
  MODE_FAILURE_LABEL,
  MODE_PROGRESS_LABEL,
  NON_IDLE_BLOCK_REASON,
  RESTART_REQUEST_TIMEOUT_MS,
  STATUS_POLL_INTERVAL_MS,
  STATUS_POLL_TIMEOUT_MS,
  STATUS_REQUEST_OPTIONS,
} from './restart-config.js'
import {
  fetchStatusSnapshot,
  formatBusyStats,
  readResponseError,
  readRuntimeIdFromStatus,
} from './restart-status.js'
import { setStatusState, setStatusText } from './status.js'

const createRestoreAfterFailure = (ctx) => (mode, reason = '') => {
  ctx.setBusy(false)
  ctx.refreshUiIdleState()
  const fallback = MODE_FAILURE_LABEL[mode] ?? MODE_FAILURE_LABEL.restart
  setStatusText(ctx.statusText, reason || fallback)
  setStatusState(ctx.statusDot, 'disconnected')
  ctx.messages?.start?.()
}

const createRestoreAfterBlocked = (ctx) => (mode, reason = '', busy = null) => {
  ctx.setBusy(false)
  ctx.setRuntimeIdle(false)
  ctx.syncControlState()
  const label = MODE_BLOCKED_LABEL[mode] ?? MODE_BLOCKED_LABEL.restart
  const detail = reason.trim() || NON_IDLE_BLOCK_REASON
  const stats = formatBusyStats(busy)
  const suffix = stats ? ` ${stats}` : ''
  setStatusText(ctx.statusText, `${label}: ${detail}${suffix}`)
  setStatusState(ctx.statusDot, 'running')
  ctx.messages?.start?.()
}

const createWaitForServer = (ctx) => async ({ previousRuntimeId }) => {
  const deadline = Date.now() + STATUS_POLL_TIMEOUT_MS
  const previousId =
    typeof previousRuntimeId === 'string' ? previousRuntimeId.trim() : ''
  if (!previousId) return false

  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(
        '/api/status',
        STATUS_REQUEST_OPTIONS,
        RESTART_REQUEST_TIMEOUT_MS,
      )
      if (!response.ok) {
        await delay(STATUS_POLL_INTERVAL_MS)
        continue
      }

      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }

      const runtimeId = readRuntimeIdFromStatus(payload)
      if (runtimeId.length > 0 && runtimeId !== previousId) {
        window.location.reload()
        return true
      }
    } catch (error) {
      console.warn('[webui] status check failed', error)
    }
    await delay(STATUS_POLL_INTERVAL_MS)
  }

  return false
}

export const createRestartRequester = (ctx) => {
  const restoreAfterFailure = createRestoreAfterFailure(ctx)
  const restoreAfterBlocked = createRestoreAfterBlocked(ctx)
  const waitForServer = createWaitForServer(ctx)

  const request = async (mode) => {
    if (ctx.isBusy()) return
    ctx.refreshUiIdleState()

    ctx.setBusy(true)
    ctx.closeToolsMenu()
    ctx.syncControlState()

    const label = MODE_PROGRESS_LABEL[mode] ?? MODE_PROGRESS_LABEL.restart
    setStatusText(ctx.statusText, label)
    setStatusState(ctx.statusDot, '')
    ctx.messages?.stop?.()
    ctx.closeAllDialogs()

    const preflight = await fetchStatusSnapshot()
    if (!preflight.runtimeId) {
      restoreAfterFailure(mode)
      return
    }
    if (!preflight.isIdle) {
      restoreAfterBlocked(mode, preflight.error, preflight.busy)
      return
    }

    try {
      const response = await fetchWithTimeout(
        MODE_ENDPOINT[mode] ?? MODE_ENDPOINT.restart,
        { method: 'POST' },
        RESTART_REQUEST_TIMEOUT_MS,
      )
      if (!response.ok) {
        const fallback = `${mode} failed (${response.status})`
        const detail = await readResponseError(response, fallback)
        if (response.status === 409 || response.status === 423) {
          const snapshot = await fetchStatusSnapshot()
          restoreAfterBlocked(mode, detail, snapshot.busy)
          return
        }
        throw new Error(detail)
      }
    } catch (error) {
      console.warn('[webui] restart request failed', error)
      const reason = error instanceof Error ? error.message : ''
      restoreAfterFailure(mode, reason)
      return
    }

    const recovered = await waitForServer({ previousRuntimeId: preflight.runtimeId })
    if (!recovered) restoreAfterFailure(mode)
  }

  return { request }
}
