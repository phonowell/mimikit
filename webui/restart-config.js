export const RESTART_REQUEST_TIMEOUT_MS = 12000
export const STATUS_POLL_TIMEOUT_MS = 60000
export const STATUS_POLL_INTERVAL_MS = 300
export const STATUS_REQUEST_OPTIONS = { cache: 'no-store' }

export const NON_IDLE_UI_HINT =
  'Restart tools are available only when manager is stopped and pending/running tasks are clear.'
export const NON_IDLE_BLOCK_REASON =
  'system is busy; wait for manager to stop and pending/running tasks to clear'

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
