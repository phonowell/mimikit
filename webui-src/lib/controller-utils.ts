import {
  formatQuotePreview,
  formatRoleLabel,
  normalizeRole,
} from './messages/quote-utils.js'

import type { ChatMessage, QuoteState } from '../types.js'

export const DELETE_MODE_EXIT_BUTTON_ID = 'delete-mode-exit-btn'
export const MESSAGE_INPUT_ID = 'message-input'

export const resolveWorkerStates = (
  maxWorkers = 1,
  activeTasks = 0,
  disconnected = false,
): string[] =>
  Array.from({ length: Math.max(1, maxWorkers) }, (_, index) =>
    disconnected ? 'disconnected' : index < activeTasks ? 'running' : 'idle',
  )

export const readJsonError = async (
  response: Response,
  fallback: string,
): Promise<string> => {
  const payload = await response.json().catch(() => null)
  return typeof payload?.error === 'string' ? payload.error : fallback
}

export const toQuoteState = (message: ChatMessage): QuoteState => ({
  id: message.id ?? '',
  label: formatRoleLabel(message.role),
  text: formatQuotePreview(message.text),
  role: normalizeRole(message.role),
})

export const focusElementById = (elementId: string | null): void => {
  if (!elementId || typeof window === 'undefined') return
  window.requestAnimationFrame(() => {
    const element = document.getElementById(elementId)
    if (element instanceof HTMLElement) element.focus()
  })
}

export type DeleteModeState = {
  deleteMode: boolean
  openTaskMenuId: string
  quote: QuoteState | null
  toolsMenuOpen: boolean
}

export type DeleteModeTransition = DeleteModeState & {
  focusTargetId: string | null
}

export const resolveDeleteModeTransition = (
  current: DeleteModeState,
  nextDeleteMode: boolean,
): DeleteModeTransition => {
  if (current.deleteMode === nextDeleteMode)
    return { ...current, focusTargetId: null }

  if (nextDeleteMode) {
    return {
      deleteMode: true,
      openTaskMenuId: '',
      quote: null,
      toolsMenuOpen: false,
      focusTargetId: DELETE_MODE_EXIT_BUTTON_ID,
    }
  }

  return {
    ...current,
    deleteMode: false,
    focusTargetId: MESSAGE_INPUT_ID,
  }
}
