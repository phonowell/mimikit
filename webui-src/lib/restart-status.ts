import { fetchWithTimeout } from './fetch-with-timeout.js'
import {
  RESTART_REQUEST_TIMEOUT_MS,
  STATUS_REQUEST_OPTIONS,
} from './restart-config.js'
import { isRecord } from './value.js'

type BusyStats = {
  managerRunning: boolean | null
  activeTasks: number | null
  pendingTasks: number | null
  pendingInputs: number | null
}

type StatusSnapshotMeta = {
  runtimeId: string
  isIdle: boolean
  error: string
  busy: BusyStats | null
}

const normalizeTaskCount = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value <= 0) return 0
  return Math.floor(value)
}

export const readBusyStatsFromStatus = (raw: unknown): BusyStats | null => {
  if (!isRecord(raw)) return null
  const managerRunning =
    typeof raw.managerRunning === 'boolean' ? raw.managerRunning : null
  const activeTasks = normalizeTaskCount(raw.activeTasks)
  const pendingTasks = normalizeTaskCount(raw.pendingTasks)
  const pendingInputs = normalizeTaskCount(raw.pendingInputs)
  if (
    managerRunning === null &&
    activeTasks === null &&
    pendingTasks === null &&
    pendingInputs === null
  )
    return null
  return { managerRunning, activeTasks, pendingTasks, pendingInputs }
}

export const formatBusyStats = (stats: BusyStats | null): string => {
  if (!stats) return ''
  const parts = []
  if (stats.managerRunning !== null)
    parts.push(`managerRunning=${stats.managerRunning}`)
  if (stats.activeTasks !== null) parts.push(`activeTasks=${stats.activeTasks}`)
  if (stats.pendingTasks !== null)
    parts.push(`pendingTasks=${stats.pendingTasks}`)
  if (stats.pendingInputs !== null)
    parts.push(`pendingInputs=${stats.pendingInputs}`)
  return parts.length > 0 ? `(${parts.join(', ')})` : ''
}

export const isStatusIdle = (raw: unknown): boolean => {
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
    typeof raw.agentStatus === 'string'
      ? raw.agentStatus.trim().toLowerCase()
      : ''
  return agentStatus === 'idle'
}

export const readRuntimeIdFromStatus = (raw: unknown): string => {
  if (!isRecord(raw)) return ''
  const runtimeId = raw.runtimeId
  if (typeof runtimeId !== 'string') return ''
  const trimmed = runtimeId.trim()
  return trimmed.length > 0 ? trimmed : ''
}

export const readStatusError = (raw: unknown): string => {
  if (!isRecord(raw)) return ''
  const error = raw.error
  if (typeof error !== 'string') return ''
  const trimmed = error.trim()
  return trimmed.length > 0 ? trimmed : ''
}

export const readResponseError = async (
  response: Response,
  fallback: string,
): Promise<string> => {
  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  const detail = readStatusError(payload)
  return detail || fallback
}

export const fetchStatusSnapshot = (): Promise<StatusSnapshotMeta> =>
  fetchStatusSnapshotWithTimeout(RESTART_REQUEST_TIMEOUT_MS)

export const fetchStatusSnapshotWithTimeout = async (
  timeoutMs: number,
): Promise<StatusSnapshotMeta> => {
  try {
    const response = await fetchWithTimeout(
      '/api/status',
      STATUS_REQUEST_OPTIONS,
      timeoutMs,
    )
    if (!response.ok) {
      return {
        runtimeId: '',
        isIdle: false,
        error: `status request failed (${response.status})`,
        busy: null,
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
      busy: readBusyStatsFromStatus(payload),
    }
  } catch {
    return {
      runtimeId: '',
      isIdle: false,
      error: 'status request failed',
      busy: null,
    }
  }
}
