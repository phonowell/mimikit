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
  conversationTitleFallback: 'Mimikit',
  noTasks: 'No tasks',
  noPlans: 'No plans',
  noFocuses: 'No focus',
  untitledTask: 'Untitled',
  cancelingTask: 'Canceling',
  quote: 'Quote',
  delete: 'Delete',
  quoteUnknown: 'Quote',
  quoteMissingMessage: 'Unavailable',
  quoteFallbackMessage: 'Message',
  deleteFailed: 'Delete failed',
  deleteConfirmPrompt: 'Delete this message?',
  sendFailed: 'Send failed',
  choiceDefaultIn: 'Default in',
  choiceDefaultOption: 'Default:',
  choiceDefaultBadge: 'Default',
  choiceSubmitting: 'Submitting choice...',
  choiceSubmitted: 'Choice submitted. Waiting for agent.',
  choiceSelectFailed: 'Select failed',
  focusSummaryLabel: 'Summary:',
  focusOpenItemsLabel: 'Open items',
  fetchMessagesFailed: 'Messages failed',
  fetchStatusFailed: 'Status failed',
  loadTasksFailed: 'Tasks failed',
  connectionLost: 'Connection lost',
  errorPrefix: 'Error',
  errorJoiner: ' · ',
  loadingAriaLabel: 'Loading',
})

export const resolveStatusText = (value) => {
  if (value === null || value === undefined) return ''
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

export const formatSystemBubbleText = (message) => {
  const normalized = String(message ?? '').trim()
  if (!normalized) return ''
  const withoutPrefix = normalized.replace(/^system:\s*/i, '').trim()
  if (!withoutPrefix) return ''
  return `System: ${withoutPrefix}`
}

export const formatUiError = (message) =>
  formatSystemBubbleText(`${UI_TEXT.errorPrefix}: ${String(message ?? '').trim() || 'Unknown error.'}`)
