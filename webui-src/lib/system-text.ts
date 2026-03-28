const STATUS_TEXT_MAP: Record<string, string> = Object.freeze({
  loading: 'CONNECTING',
  idle: 'IDLE',
  running: 'ACTIVE',
  disconnected: 'OFFLINE',
  restarting: 'RESTARTING',
  resetting: 'RESETTING',
  'restart failed': 'RESTART ERROR',
  'reset failed': 'RESET ERROR',
})

const TASK_STATUS_LABEL_MAP: Record<string, string> = Object.freeze({
  pending: 'queued',
  paused: 'paused',
  running: 'running',
  succeeded: 'done',
  failed: 'failed',
  canceled: 'canceled',
})

const TASK_PENDING_REASON_LABEL_MAP: Record<string, string> = Object.freeze({
  waiting_capacity: 'Waiting: capacity',
  waiting_dispatch_lock: 'Waiting: dispatch lock',
})

export const UI_TEXT = Object.freeze({
  conversationTitleFallback: 'Mimikit',
  noTasks: 'No tasks',
  openTasksLabel: 'Open',
  closedTasksLabel: 'Closed',
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
  copyPlanIdAction: 'copy id',
  copyPlanIdSuccess: 'Plan id copied',
  copyPlanIdMissing: 'Plan id unavailable',
  copyTaskIdFailedInsecureContext: 'Clipboard requires HTTPS or localhost.',
  copyTaskIdFailedApiUnavailable:
    'Clipboard API is unavailable in this environment.',
  copyTaskIdFailedPermissionDenied:
    'Clipboard permission was denied by the browser.',
  copyTaskIdFailedWrite: 'Failed to write task id to clipboard.',
  copyPlanIdFailedWrite: 'Failed to write plan id to clipboard.',
  copyTaskIdManualCopyPrompt: 'Manual copy: copy the task id below.',
  copyPlanIdManualCopyPrompt: 'Manual copy: copy the plan id below.',
  copyTaskIdManualCopyHint: 'Use the opened prompt to copy manually.',
  copyTaskIdManualCopyFallback: 'Manual copy task id',
  copyPlanIdManualCopyFallback: 'Manual copy plan id',
  deleteMessages: 'Delete messages',
  deleteModeExit: 'Exit delete messages',
  deleteModeConfirmPrompt: 'Enter delete mode?',
  quote: 'Quote',
  delete: 'Delete',
  quoteUnknown: 'Quote',
  quoteMissingMessage: 'Unavailable',
  quoteFallbackMessage: 'Message',
  deleteFailed: 'Delete failed',
  deleteTaskConfirmPrompt: 'Delete this task and all related history?',
  sendFailed: 'Send failed',
  focusOpenItemsLabel: 'Open items',
  connectionLost: 'Connection lost',
  errorPrefix: 'Error',
  loadingAriaLabel: 'Loading',
})

export const resolveStatusText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  const raw = typeof value === 'string' ? value : String(value)
  const text = raw.trim()
  if (!text) return ''
  const mapped = STATUS_TEXT_MAP[text.toLowerCase()]
  return mapped ?? text.toUpperCase()
}

export const resolveTaskStatusLabel = (value: unknown): string => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!raw) return 'unknown'
  return TASK_STATUS_LABEL_MAP[raw] ?? raw
}

export const resolveTaskPendingReasonLabel = (value: unknown): string => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!raw) return ''
  return TASK_PENDING_REASON_LABEL_MAP[raw] ?? ''
}

export const formatSystemBubbleText = (message: unknown): string => {
  const normalized = String(message ?? '').trim()
  if (!normalized) return ''
  const withoutPrefix = normalized.replace(/^system:\s*/i, '').trim()
  if (!withoutPrefix) return ''
  return `System: ${withoutPrefix}`
}

export const formatUiError = (message: unknown): string =>
  formatSystemBubbleText(
    `${UI_TEXT.errorPrefix}: ${String(message ?? '').trim() || 'Unknown error.'}`,
  )
