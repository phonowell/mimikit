const STATUS_TEXT_MAP = Object.freeze({
  loading: 'CONNECTING',
  idle: 'IDLE',
  running: 'ACTIVE',
  disconnected: 'OFFLINE',
  restarting: 'RESTARTING',
  resetting: 'RESETTING',
  'restart failed': 'RESTART ERROR',
  'reset failed': 'RESET ERROR',
})

const TASK_STATUS_LABEL_MAP = Object.freeze({
  pending: 'queued',
  running: 'running',
  succeeded: 'done',
  failed: 'failed',
  canceled: 'canceled',
})

export const UI_TEXT = Object.freeze({
  statusTitleFallback: 'Status',
  noTasks: 'No tasks',
  untitledTask: 'Untitled',
  cancelingTask: 'Canceling',
  quote: 'Quote',
  quoteUnknown: 'Quote',
  quoteMissingMessage: 'Unavailable',
  quoteFallbackMessage: 'Message',
  sendFailed: 'Send failed',
  fetchMessagesFailed: 'Messages failed',
  fetchStatusFailed: 'Status failed',
  loadTasksFailed: 'Tasks failed',
  connectionLost: 'Connection lost',
  errorPrefix: 'Error',
  errorJoiner: ' · ',
  loadingAriaLabel: 'Loading',
  seenByAgent: 'Seen',
})

export const resolveStatusText = (value) => {
  if (value == null) return ''
  const raw = typeof value === 'string' ? value : String(value)
  const text = raw.trim()
  if (!text) return ''
  const mapped = STATUS_TEXT_MAP[text.toLowerCase()]
  return mapped ?? text.toUpperCase()
}

export const resolveTaskStatusLabel = (value) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!raw) return 'unknown'
  return TASK_STATUS_LABEL_MAP[raw] ?? raw
}

export const formatHttpFailure = (fallback, status) =>
  `${fallback} (${status})`

export const formatUiError = (message) =>
  `${UI_TEXT.errorPrefix}${UI_TEXT.errorJoiner}${message}`
