import { UI_TEXT } from './system-text.js'

type ClipboardWriter = (text: string) => Promise<void>
type PromptLike = (message?: string, defaultValue?: string) => string | null
type NavigatorLike = {
  clipboard?: {
    writeText?: ClipboardWriter
  }
}

type CopyTaskIdOptions = {
  navigator?: unknown
  prompt?: unknown
  isSecureContext?: unknown
}

type CopyTaskIdFailureCode =
  | 'missing-task-id'
  | 'insecure-context'
  | 'clipboard-unavailable'
  | 'permission-denied'
  | 'write-failed'

type CopyTaskIdResult =
  | { ok: true; code: 'copied'; message: string }
  | { ok: false; code: CopyTaskIdFailureCode; message: string }

const normalizeTaskId = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const resolveNavigator = (value: unknown): NavigatorLike | null => {
  if (value && typeof value === 'object') return value
  if (typeof window === 'undefined') return null
  return window.navigator
}

const resolvePrompt = (value: unknown): PromptLike | null => {
  if (typeof value === 'function') return value as PromptLike
  if (typeof window === 'undefined') return null
  if (typeof window.prompt !== 'function') return null
  return (message, text) => window.prompt(message, text)
}

const resolveSecureContext = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value
  if (typeof window === 'undefined') return false
  return Boolean(window.isSecureContext)
}

const resolveClipboardWriter = (
  navigatorLike: NavigatorLike | null,
): ClipboardWriter | null => {
  const clipboard = navigatorLike?.clipboard
  const writeText = clipboard?.writeText
  if (typeof writeText !== 'function') return null
  return (text) => writeText.call(clipboard, text)
}

const isPermissionDeniedError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  const errorLike = error as { name?: unknown; message?: unknown }
  const name = typeof errorLike.name === 'string' ? errorLike.name.trim() : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return true
  const message =
    typeof errorLike.message === 'string'
      ? errorLike.message.trim().toLowerCase()
      : ''
  if (!message) return false
  return message.includes('permission') || message.includes('denied')
}

const promptManualCopy = (
  prompt: PromptLike | null,
  taskId: string,
  reason: string,
): boolean => {
  if (typeof prompt !== 'function') return false
  const promptText = `${reason}\n${UI_TEXT.copyTaskIdManualCopyPrompt}`
  try {
    prompt(promptText, taskId)
    return true
  } catch {
    return false
  }
}

const withManualCopyHint = (
  message: string,
  taskId: string,
  prompted: boolean,
): string =>
  prompted
    ? `${message} ${UI_TEXT.copyTaskIdManualCopyHint}`
    : `${message} ${UI_TEXT.copyTaskIdManualCopyFallback}: ${taskId}`

const createFailureResult = (
  code: CopyTaskIdFailureCode,
  message: string,
): CopyTaskIdResult => ({
  ok: false,
  code,
  message,
})

export const copyTaskIdToClipboard = async (
  taskId: unknown,
  options: CopyTaskIdOptions = {},
): Promise<CopyTaskIdResult> => {
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
    return { ok: true, code: 'copied', message: UI_TEXT.copyTaskIdSuccess }
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
