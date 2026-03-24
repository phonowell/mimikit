import { delay, fetchWithTimeout } from './fetch-with-timeout.js'
import {
  MODE_BLOCKED_LABEL,
  MODE_ENDPOINT,
  MODE_FAILURE_LABEL,
  MODE_PROGRESS_LABEL,
  RESTART_REQUEST_TIMEOUT_MS,
  STATUS_POLL_INTERVAL_MS,
  STATUS_POLL_TIMEOUT_MS,
} from './restart-config.js'
import {
  fetchStatusSnapshot,
  formatBusyStats,
  readResponseError,
  readRuntimeIdFromStatus,
} from './restart-status.js'

import type { StatusSnapshot } from '../types.js'

export type RestartMode = 'restart' | 'reset'

export type RestartResult =
  | { ok: true }
  | {
      ok: false
      status: StatusSnapshot
      message: string
    }

const toStatusSnapshot = (
  agentStatus: string,
  busy?: {
    managerRunning?: boolean | null
    activeTasks?: number | null
    pendingTasks?: number | null
    pendingInputs?: number | null
  } | null,
): StatusSnapshot => ({
  agentStatus,
  activeTasks: busy?.activeTasks ?? 0,
  pendingTasks: busy?.pendingTasks ?? 0,
  pendingInputs: busy?.pendingInputs ?? 0,
  managerRunning: busy?.managerRunning ?? agentStatus === 'running',
})

export const requestRuntimeControl = async (
  mode: RestartMode,
): Promise<RestartResult> => {
  const progressLabel = MODE_PROGRESS_LABEL[mode] ?? mode
  const preflight = await fetchStatusSnapshot()
  if (!preflight.runtimeId) {
    return {
      ok: false,
      status: toStatusSnapshot('disconnected'),
      message: MODE_FAILURE_LABEL[mode] ?? progressLabel,
    }
  }
  if (!preflight.isIdle) {
    const blocked = MODE_BLOCKED_LABEL[mode] ?? `${mode} blocked`
    const suffix = formatBusyStats(preflight.busy)
    return {
      ok: false,
      status: toStatusSnapshot('running', preflight.busy),
      message: `${blocked}: ${preflight.error}${suffix ? ` ${suffix}` : ''}`,
    }
  }

  try {
    const response = await fetchWithTimeout(
      MODE_ENDPOINT[mode] ?? MODE_ENDPOINT.restart,
      { method: 'POST' },
      RESTART_REQUEST_TIMEOUT_MS,
    )
    if (!response.ok) {
      const detail = await readResponseError(
        response,
        `${mode} failed (${response.status})`,
      )
      const snapshot = await fetchStatusSnapshot()
      const blocked = response.status === 409 || response.status === 423
      return {
        ok: false,
        status: toStatusSnapshot(
          blocked ? 'running' : 'disconnected',
          snapshot.busy,
        ),
        message: blocked
          ? `${MODE_BLOCKED_LABEL[mode] ?? `${mode} blocked`}: ${detail}${formatBusyStats(snapshot.busy) ? ` ${formatBusyStats(snapshot.busy)}` : ''}`
          : detail,
      }
    }
  } catch (error) {
    return {
      ok: false,
      status: toStatusSnapshot('disconnected'),
      message: error instanceof Error ? error.message : String(error),
    }
  }

  const deadline = Date.now() + STATUS_POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(
        '/api/status',
        { cache: 'no-store' },
        RESTART_REQUEST_TIMEOUT_MS,
      )
      if (response.ok) {
        const payload = (await response.json()) as unknown
        if (
          readRuntimeIdFromStatus(payload) &&
          readRuntimeIdFromStatus(payload) !== preflight.runtimeId
        ) {
          window.location.reload()
          return { ok: true }
        }
      }
    } catch {}
    await delay(STATUS_POLL_INTERVAL_MS)
  }

  return {
    ok: false,
    status: toStatusSnapshot('disconnected'),
    message: MODE_FAILURE_LABEL[mode] ?? progressLabel,
  }
}
