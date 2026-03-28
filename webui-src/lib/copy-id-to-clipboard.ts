type ClipboardWriter = (text: string) => Promise<void>
type PromptLike = (message?: string, defaultValue?: string) => string | null
type NavigatorLike = {
  clipboard?: {
    writeText?: ClipboardWriter
  }
}

type CopyIdTexts = {
  failedApiUnavailable: string
  failedInsecureContext: string
  failedPermissionDenied: string
  failedWrite: string
  manualCopyFallback: string
  manualCopyHint: string
  manualCopyPrompt: string
  missing: string
  success: string
}

export type CopyIdOptions = {
  isSecureContext?: unknown
  navigator?: unknown
  prompt?: unknown
}

export type CopyIdFailureCode =
  | 'missing-task-id'
  | 'insecure-context'
  | 'clipboard-unavailable'
  | 'permission-denied'
  | 'write-failed'

export type CopyIdResult =
  | { ok: true; code: 'copied'; message: string }
  | { ok: false; code: CopyIdFailureCode; message: string }

const normalizeId = (value: unknown): string =>
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
  id: string,
  reason: string,
  manualCopyPrompt: string,
): boolean => {
  if (typeof prompt !== 'function') return false
  try {
    prompt(`${reason}\n${manualCopyPrompt}`, id)
    return true
  } catch {
    return false
  }
}

const withManualCopyHint = (
  message: string,
  id: string,
  texts: CopyIdTexts,
  prompted: boolean,
): string =>
  prompted
    ? `${message} ${texts.manualCopyHint}`
    : `${message} ${texts.manualCopyFallback}: ${id}`

const createFailureResult = (
  code: CopyIdFailureCode,
  message: string,
): CopyIdResult => ({
  ok: false,
  code,
  message,
})

export const copyIdToClipboard = async (
  id: unknown,
  texts: CopyIdTexts,
  options: CopyIdOptions = {},
): Promise<CopyIdResult> => {
  const normalizedId = normalizeId(id)
  if (!normalizedId)
    return createFailureResult('missing-task-id', texts.missing)

  const navigatorLike = resolveNavigator(options.navigator)
  const prompt = resolvePrompt(options.prompt)
  const isSecureContext = resolveSecureContext(options.isSecureContext)
  const writeClipboardText = resolveClipboardWriter(navigatorLike)

  if (!isSecureContext) {
    const prompted = promptManualCopy(
      prompt,
      normalizedId,
      texts.failedInsecureContext,
      texts.manualCopyPrompt,
    )
    return createFailureResult(
      'insecure-context',
      withManualCopyHint(
        texts.failedInsecureContext,
        normalizedId,
        texts,
        prompted,
      ),
    )
  }

  if (!writeClipboardText) {
    const prompted = promptManualCopy(
      prompt,
      normalizedId,
      texts.failedApiUnavailable,
      texts.manualCopyPrompt,
    )
    return createFailureResult(
      'clipboard-unavailable',
      withManualCopyHint(
        texts.failedApiUnavailable,
        normalizedId,
        texts,
        prompted,
      ),
    )
  }

  try {
    await writeClipboardText(normalizedId)
    return { ok: true, code: 'copied', message: texts.success }
  } catch (error) {
    const reason = isPermissionDeniedError(error)
      ? texts.failedPermissionDenied
      : texts.failedWrite
    const prompted = promptManualCopy(
      prompt,
      normalizedId,
      reason,
      texts.manualCopyPrompt,
    )
    return createFailureResult(
      isPermissionDeniedError(error) ? 'permission-denied' : 'write-failed',
      withManualCopyHint(reason, normalizedId, texts, prompted),
    )
  }
}

export type { CopyIdTexts }
