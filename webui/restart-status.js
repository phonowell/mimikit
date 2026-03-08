import { fetchWithTimeout } from './fetch-with-timeout.js'
import {
  RESTART_REQUEST_TIMEOUT_MS,
  STATUS_REQUEST_OPTIONS,
} from './restart-config.js'
import { isRecord } from './value.js'

const normalizeTaskCount = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value <= 0) return 0
  return Math.floor(value)
}

export const isStatusIdle = (raw) => {
  if (!isRecord(raw)) return false
  const managerRunning = raw.managerRunning
  const activeTasks = normalizeTaskCount(raw.activeTasks)
  const pendingTasks = normalizeTaskCount(raw.pendingTasks)

  if (
    typeof managerRunning === 'boolean' &&
    activeTasks !== null &&
    pendingTasks !== null
  )
    return !managerRunning && activeTasks === 0 && pendingTasks === 0

  const agentStatus =
    typeof raw.agentStatus === 'string' ? raw.agentStatus.trim().toLowerCase() : ''
  return agentStatus === 'idle'
}

export const readRuntimeIdFromStatus = (raw) => {
  if (!isRecord(raw)) return ''
  const runtimeId = raw.runtimeId
  if (typeof runtimeId !== 'string') return ''
  const trimmed = runtimeId.trim()
  return trimmed.length > 0 ? trimmed : ''
}

export const readStatusError = (raw) => {
  if (!isRecord(raw)) return ''
  const error = raw.error
  if (typeof error !== 'string') return ''
  const trimmed = error.trim()
  return trimmed.length > 0 ? trimmed : ''
}

export const readResponseError = async (response, fallback) => {
  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  const detail = readStatusError(payload)
  return detail || fallback
}

export const fetchStatusSnapshot = async () => {
  try {
    const response = await fetchWithTimeout(
      '/api/status',
      STATUS_REQUEST_OPTIONS,
      RESTART_REQUEST_TIMEOUT_MS,
    )
    if (!response.ok) {
      return {
        runtimeId: '',
        isIdle: false,
        error: `status request failed (${response.status})`,
      }
    }

    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    return {
      runtimeId: readRuntimeIdFromStatus(payload),
      isIdle: isStatusIdle(payload),
      error: readStatusError(payload),
    }
  } catch {
    return {
      runtimeId: '',
      isIdle: false,
      error: 'status request failed',
    }
  }
}
