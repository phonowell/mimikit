import { UI_TEXT } from './system-text.js'

const normalizeTaskId = (value) =>
  typeof value === 'string' ? value.trim() : ''

const resolveNavigator = (value) => {
  if (value && typeof value === 'object') return value
  if (typeof window === 'undefined') return null
  return window.navigator
}

const resolvePrompt = (value) => {
  if (typeof value === 'function') return value
  if (typeof window === 'undefined') return null
  if (typeof window.prompt !== 'function') return null
  return (message, text) => window.prompt(message, text)
}

const resolveSecureContext = (value) => {
  if (typeof value === 'boolean') return value
  if (typeof window === 'undefined') return false
  return Boolean(window.isSecureContext)
}

const resolveClipboardWriter = (navigatorLike) => {
  const clipboard = navigatorLike?.clipboard
  if (!clipboard || typeof clipboard.writeText !== 'function') return null
  return (text) => clipboard.writeText(text)
}

const isPermissionDeniedError = (error) => {
  if (!error || typeof error !== 'object') return false
  const name = typeof error.name === 'string' ? error.name.trim() : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return true
  const message =
    typeof error.message === 'string' ? error.message.trim().toLowerCase() : ''
  if (!message) return false
  return message.includes('permission') || message.includes('denied')
}

const promptManualCopy = (prompt, taskId, reason) => {
  if (typeof prompt !== 'function') return false
  const promptText = `${reason}\n${UI_TEXT.copyTaskIdManualCopyPrompt}`
  try {
    prompt(promptText, taskId)
    return true
  } catch {
    return false
  }
}

const withManualCopyHint = (message, taskId, prompted) =>
  prompted
    ? `${message} ${UI_TEXT.copyTaskIdManualCopyHint}`
    : `${message} ${UI_TEXT.copyTaskIdManualCopyFallback}: ${taskId}`

const createFailureResult = (code, message) => ({
  ok: false,
  code,
  message,
})

export const copyTaskIdToClipboard = async (taskId, options = {}) => {
  const normalizedTaskId = normalizeTaskId(taskId)
  if (!normalizedTaskId)
    return createFailureResult('missing-task-id', UI_TEXT.copyTaskIdMissing)

  const navigatorLike = resolveNavigator(options.navigator)
  const prompt = resolvePrompt(options.prompt)
  const isSecureContext = resolveSecureContext(options.isSecureContext)
  const writeClipboardText = resolveClipboardWriter(navigatorLike)

  if (!isSecureContext) {
    const reason = UI_TEXT.copyTaskIdFailedInsecureContext
    const prompted = promptManualCopy(prompt, normalizedTaskId, reason)
    return createFailureResult(
      'insecure-context',
      withManualCopyHint(reason, normalizedTaskId, prompted),
    )
  }

  if (!writeClipboardText) {
    const reason = UI_TEXT.copyTaskIdFailedApiUnavailable
    const prompted = promptManualCopy(prompt, normalizedTaskId, reason)
    return createFailureResult(
      'clipboard-unavailable',
      withManualCopyHint(reason, normalizedTaskId, prompted),
    )
  }

  try {
    await writeClipboardText(normalizedTaskId)
    return {
      ok: true,
      code: 'copied',
      message: UI_TEXT.copyTaskIdSuccess,
    }
  } catch (error) {
    const permissionDenied = isPermissionDeniedError(error)
    const reason = permissionDenied
      ? UI_TEXT.copyTaskIdFailedPermissionDenied
      : UI_TEXT.copyTaskIdFailedWrite
    const prompted = promptManualCopy(prompt, normalizedTaskId, reason)
    return createFailureResult(
      permissionDenied ? 'permission-denied' : 'write-failed',
      withManualCopyHint(reason, normalizedTaskId, prompted),
    )
  }
}
