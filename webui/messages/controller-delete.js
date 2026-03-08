import { createConfirmDialogController } from '../confirm-dialog.js'
import { fetchWithTimeout } from '../fetch-with-timeout.js'
import { UI_TEXT } from '../system-text.js'

import { renderError } from './render-list.js'

const DELETE_REQUEST_TIMEOUT_MS = 15000

const readMessageId = (message) => {
  if (!message || typeof message.id !== 'string') return ''
  return message.id.trim()
}

export const createDeleteMessageController = ({
  deleteConfirmDialog,
  deleteConfirmCancelBtn,
  deleteConfirmBtn,
  quote,
  messagesEl,
  removeEmpty,
  getRemoveEmpty,
  updateScrollButton,
}) => {
  const resolveRemoveEmpty = getRemoveEmpty ?? removeEmpty ?? (() => () => {})
  let isDeletePending = false
  let deleteModeEnabled = false
  let deleteModeConfirmed = false

  const deleteConfirm = createConfirmDialogController({
    dialog: deleteConfirmDialog,
    cancelBtn: deleteConfirmCancelBtn,
    confirmBtn: deleteConfirmBtn,
    fallbackMessage: UI_TEXT.deleteConfirmPrompt,
  })

  const requestDeleteMessage = async (id) => {
    if (!id) return false
    try {
      const response = await fetchWithTimeout(
        `/api/messages/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
        DELETE_REQUEST_TIMEOUT_MS,
      )
      if (!response.ok) {
        let data = null
        try {
          data = await response.json()
        } catch {
          data = null
        }
        throw new Error(data?.error || UI_TEXT.deleteFailed)
      }
      const activeQuote = quote.getActive()
      if (activeQuote?.id === id) quote.clear()
      return true
    } catch (error) {
      renderError(
        {
          messagesEl,
          removeEmpty: resolveRemoveEmpty(),
          updateScrollButton,
        },
        error,
      )
      return false
    }
  }

  const deleteMessage = async (message) => {
    const id = readMessageId(message)
    if (!id) return
    if (deleteModeEnabled) {
      if (!deleteModeConfirmed) {
        const shouldDelete = await deleteConfirm.request()
        if (!shouldDelete) return
        deleteModeConfirmed = true
      }
      await requestDeleteMessage(id)
      return
    }
    const shouldDelete = await deleteConfirm.request()
    if (!shouldDelete) return
    isDeletePending = true
    deleteConfirm.setActionsDisabled(true)
    try {
      await requestDeleteMessage(id)
    } finally {
      isDeletePending = false
      deleteConfirm.setActionsDisabled(false)
    }
  }

  const setDeleteMode = (enabled) => {
    deleteModeEnabled = Boolean(enabled)
    deleteModeConfirmed = false
    if (!deleteModeEnabled) return
    if (deleteConfirm.isOpen()) deleteConfirm.close()
  }

  return {
    deleteMessage,
    setDeleteMode,
    bindDialogEvents: deleteConfirm.bindEvents,
    bindDialogHandlers: deleteConfirm.bindEvents,
  }
}
