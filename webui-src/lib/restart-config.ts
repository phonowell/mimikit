export const RESTART_REQUEST_TIMEOUT_MS = 12_000
export const STATUS_POLL_TIMEOUT_MS = 45_000
export const STATUS_POLL_REQUEST_TIMEOUT_MS = 2_000
export const STATUS_POLL_INTERVAL_MS = 300
export const STATUS_REQUEST_OPTIONS: RequestInit = { cache: 'no-store' }

export const MODE_ENDPOINT = Object.freeze({
  restart: '/api/restart',
  reset: '/api/reset',
})

export const MODE_PROGRESS_LABEL = Object.freeze({
  restart: 'restarting',
  reset: 'resetting',
})

export const MODE_FAILURE_LABEL = Object.freeze({
  restart: 'restart failed',
  reset: 'reset failed',
})

export const MODE_BLOCKED_LABEL = Object.freeze({
  restart: 'restart blocked',
  reset: 'reset blocked',
})
