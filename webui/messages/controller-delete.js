import { createDialogController } from '../dialog.js'
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
  const deleteDialogEnabled = Boolean(
    deleteConfirmDialog && deleteConfirmCancelBtn && deleteConfirmBtn,
  )
  let pendingDeleteId = ''
  let isDeletePending = false
  let deleteModeEnabled = false
  let deleteModeConfirmed = false

  const deleteDialog = deleteDialogEnabled
    ? createDialogController({
        dialog: deleteConfirmDialog,
        focusOnOpen: deleteConfirmCancelBtn,
        onAfterClose: () => {
          if (isDeletePending) return
          pendingDeleteId = ''
        },
      })
    : null

  const setDeleteActionsDisabled = (disabled) => {
    if (deleteConfirmCancelBtn) deleteConfirmCancelBtn.disabled = disabled
    if (deleteConfirmBtn) deleteConfirmBtn.disabled = disabled
  }

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

  const confirmDelete = async () => {
    if (!pendingDeleteId || isDeletePending) return
    deleteModeConfirmed = deleteModeEnabled
    isDeletePending = true
    setDeleteActionsDisabled(true)
    const deleted = await requestDeleteMessage(pendingDeleteId)
    isDeletePending = false
    setDeleteActionsDisabled(false)
    if (!deleted) return
    pendingDeleteId = ''
    if (deleteDialog) deleteDialog.close()
  }

  const deleteMessage = async (message) => {
    const id = readMessageId(message)
    if (!id) return
    if (deleteModeEnabled) {
      if (!deleteModeConfirmed) {
        if (deleteDialogEnabled && deleteDialog) {
          pendingDeleteId = id
          deleteDialog.open()
          return
        }
        const shouldDelete =
          typeof window === 'undefined' ||
          typeof window.confirm !== 'function' ||
          window.confirm(UI_TEXT.deleteConfirmPrompt)
        if (!shouldDelete) return
        deleteModeConfirmed = true
      }
      await requestDeleteMessage(id)
      return
    }
    if (deleteDialogEnabled && deleteDialog) {
      pendingDeleteId = id
      deleteDialog.open()
      return
    }
    const shouldDelete =
      typeof window === 'undefined' ||
      typeof window.confirm !== 'function' ||
      window.confirm(UI_TEXT.deleteConfirmPrompt)
    if (!shouldDelete) return
    await requestDeleteMessage(id)
  }

  const bindDialogHandlers = () => {
    if (!deleteDialogEnabled || !deleteDialog || !deleteConfirmDialog) return
    const onDialogClick = (event) => {
      deleteDialog.handleDialogClick(event)
    }
    const onDialogClose = () => {
      deleteDialog.handleDialogClose()
    }
    const onDialogCancel = (event) => {
      deleteDialog.handleDialogCancel(event)
    }
    const onDeleteCancel = (event) => {
      event.preventDefault()
      if (isDeletePending) return
      pendingDeleteId = ''
      deleteDialog.close()
    }
    const onDeleteConfirm = (event) => {
      event.preventDefault()
      if (isDeletePending) return
      void confirmDelete()
    }
    deleteConfirmDialog.addEventListener('click', onDialogClick)
    deleteConfirmDialog.addEventListener('close', onDialogClose)
    deleteConfirmDialog.addEventListener('cancel', onDialogCancel)
    deleteConfirmCancelBtn.addEventListener('click', onDeleteCancel)
    deleteConfirmBtn.addEventListener('click', onDeleteConfirm)
  }

  const setDeleteMode = (enabled) => {
    deleteModeEnabled = Boolean(enabled)
    deleteModeConfirmed = false
    if (!deleteModeEnabled) return
    pendingDeleteId = ''
    if (deleteDialog?.isOpen()) deleteDialog.close()
  }

  return {
    deleteMessage,
    setDeleteMode,
    bindDialogEvents: bindDialogHandlers,
    bindDialogHandlers,
  }
}
