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
  paused: 'paused',
  running: 'running',
  succeeded: 'done',
  failed: 'failed',
  canceled: 'canceled',
})

const TASK_PENDING_REASON_LABEL_MAP = Object.freeze({
  waiting_capacity: 'Waiting: capacity',
})

export const UI_TEXT = Object.freeze({
  conversationTitleFallback: 'Mimikit',
  noReviewStatus: 'No pending review items',
  resumeAllRecoverable: 'Continue all resumable',
  resumeAllRecoverableBusy: 'Continuing resumable tasks...',
  resumeAllRecoverableDone: 'Queued resumable tasks.',
  resumeAllRecoverableNone: 'No resumable tasks.',
  noTasks: 'No tasks',
  noPlans: 'No plans',
  noFocuses: 'No focus',
  untitledTask: 'Untitled',
  cancelingTask: 'Canceling',
  deletingTask: 'Deleting',
  pausingTask: 'Pausing',
  resumingTask: 'Resuming',
  copyingTaskId: 'Copying id',
  copyTaskIdAction: 'copy id',
  copyTaskIdSuccess: 'Task id copied',
  copyTaskIdMissing: 'Task id unavailable',
  copyTaskIdFailedInsecureContext: 'Clipboard requires HTTPS or localhost.',
  copyTaskIdFailedApiUnavailable:
    'Clipboard API is unavailable in this environment.',
  copyTaskIdFailedPermissionDenied:
    'Clipboard permission was denied by the browser.',
  copyTaskIdFailedWrite: 'Failed to write task id to clipboard.',
  copyTaskIdManualCopyPrompt: 'Manual copy: copy the task id below.',
  copyTaskIdManualCopyHint: 'Use the opened prompt to copy manually.',
  copyTaskIdManualCopyFallback: 'Manual copy task id',
  deleteMessages: 'Delete messages',
  deleteModeExit: 'Exit delete messages',
  deleteModeConfirmPrompt: 'Enter delete mode?',
  quote: 'Quote',
  delete: 'Delete',
  quoteUnknown: 'Quote',
  quoteMissingMessage: 'Unavailable',
  quoteFallbackMessage: 'Message',
  deleteFailed: 'Delete failed',
  deleteConfirmPrompt: 'Delete this message?',
  deleteTaskConfirmPrompt: 'Delete this task and all related history?',
  sendFailed: 'Send failed',
  choiceDefaultIn: 'Default in',
  choiceDefaultOption: 'Default:',
  choiceDefaultBadge: 'Default',
  choiceSubmitting: 'Submitting choice...',
  choiceSubmitted: 'Choice submitted. Waiting for agent.',
  choiceSelectFailed: 'Select failed',
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

export const resolveTaskPendingReasonLabel = (value) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!raw) return ''
  return TASK_PENDING_REASON_LABEL_MAP[raw] ?? ''
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
