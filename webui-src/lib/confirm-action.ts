import { fetchWithTimeout } from '../../webui/fetch-with-timeout.js'
import { UI_TEXT } from '../../webui/system-text.js'

import { readJsonError } from './controller-utils.js'
import { requestRuntimeControl } from './restart.js'

import type { AppState, ConfirmDialogState, QuoteState } from '../types.js'
import type { Dispatch, SetStateAction } from 'react'

const REQUEST_TIMEOUT_MS = 15_000

type Args = {
  appendClientError: (error: unknown) => void
  confirmDialog: ConfirmDialogState | null
  quote: QuoteState | null
  setAppState: Dispatch<SetStateAction<AppState>>
  setBusy: Dispatch<SetStateAction<boolean>>
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>
  setQuote: Dispatch<SetStateAction<QuoteState | null>>
  setStatusOverride: Dispatch<
    SetStateAction<{ state: string; text: string } | null>
  >
  setToolsMenuOpen: Dispatch<SetStateAction<boolean>>
}

export const runConfirmAction = async ({
  appendClientError,
  confirmDialog,
  quote,
  setAppState,
  setBusy,
  setConfirmDialog,
  setQuote,
  setStatusOverride,
  setToolsMenuOpen,
}: Args) => {
  if (!confirmDialog) return
  setBusy(true)
  setConfirmDialog(null)

  try {
    if (confirmDialog.kind === 'message') {
      const response = await fetchWithTimeout(
        `/api/messages/${encodeURIComponent(confirmDialog.id)}`,
        { method: 'DELETE' },
        REQUEST_TIMEOUT_MS,
      )
      if (!response.ok)
        throw new Error(await readJsonError(response, UI_TEXT.deleteFailed))
      if (quote?.id === confirmDialog.id) setQuote(null)
      return
    }

    if (confirmDialog.kind === 'task') {
      const response = await fetchWithTimeout(
        `/api/tasks/${encodeURIComponent(confirmDialog.id)}/delete`,
        { method: 'POST' },
        REQUEST_TIMEOUT_MS,
      )
      if (!response.ok)
        throw new Error(await readJsonError(response, 'Failed to delete task'))
      return
    }

    setToolsMenuOpen(false)
    setStatusOverride({
      state: '',
      text: confirmDialog.kind === 'restart' ? 'restarting' : 'resetting',
    })
    const result = await requestRuntimeControl(confirmDialog.kind)
    if (result.ok) return
    setStatusOverride({
      state: result.status.agentStatus,
      text: result.message,
    })
    setAppState((current) => ({
      ...current,
      status: result.status,
      awaitingReply: false,
    }))
  } catch (error) {
    appendClientError(error)
  } finally {
    setBusy(false)
  }
}
