import { createDialogController } from './dialog.js'
import { UI_TEXT } from './system-text.js'

const readTaskId = (value) =>
  typeof value === 'string' ? value.trim() : ''

export const createTaskDeleteController = ({
  deleteConfirmDialog,
  deleteConfirmCancelBtn,
  deleteConfirmBtn,
} = {}) => {
  const enabled = Boolean(
    deleteConfirmDialog && deleteConfirmCancelBtn && deleteConfirmBtn,
  )
  let pendingTaskId = ''
  let isDeletePending = false
  let pendingConfirmResolve = null

  const dialog = enabled
    ? createDialogController({
        dialog: deleteConfirmDialog,
        focusOnOpen: deleteConfirmCancelBtn,
        onAfterClose: () => {
          if (isDeletePending) return
          pendingTaskId = ''
        },
      })
    : null

  const setActionsDisabled = (disabled) => {
    if (deleteConfirmCancelBtn) deleteConfirmCancelBtn.disabled = disabled
    if (deleteConfirmBtn) deleteConfirmBtn.disabled = disabled
  }

  const requestConfirmTaskDelete = async (taskId) => {
    const normalizedTaskId = readTaskId(taskId)
    if (!normalizedTaskId) return false

    if (!enabled || !dialog) {
      return (
        typeof window === 'undefined' ||
        typeof window.confirm !== 'function' ||
        window.confirm(UI_TEXT.deleteTaskConfirmPrompt)
      )
    }

    pendingTaskId = normalizedTaskId
    dialog.open()
    return new Promise((resolve) => {
      const onCancel = () => {
        if (isDeletePending) return
        pendingTaskId = ''
        pendingConfirmResolve = null
        dialog.close()
        resolve(false)
      }
      const onConfirm = () => {
        if (isDeletePending) return
        if (readTaskId(pendingTaskId) !== normalizedTaskId) {
          pendingConfirmResolve = null
          dialog.close()
          resolve(false)
          return
        }
        pendingConfirmResolve = null
        resolve(true)
      }
      const onDialogClose = () => {
        cleanup()
        if (pendingConfirmResolve !== resolve) return
        pendingConfirmResolve = null
        resolve(false)
      }
      const cleanup = () => {
        deleteConfirmCancelBtn.removeEventListener('click', onCancel)
        deleteConfirmBtn.removeEventListener('click', onConfirm)
        deleteConfirmDialog.removeEventListener('close', onDialogClose)
      }
      deleteConfirmCancelBtn.addEventListener('click', onCancel, {
        once: true,
      })
      deleteConfirmBtn.addEventListener('click', onConfirm, { once: true })
      deleteConfirmDialog.addEventListener('close', onDialogClose, {
        once: true,
      })
      pendingConfirmResolve = resolve
    }).finally(() => {
      pendingTaskId = ''
      if (dialog.isOpen()) dialog.close()
    })
  }

  const wrapDeleteRequest = async (run) => {
    if (isDeletePending) return false
    isDeletePending = true
    setActionsDisabled(true)
    try {
      return await run()
    } finally {
      isDeletePending = false
      setActionsDisabled(false)
    }
  }

  const bindDialogEvents = () => {
    if (!enabled || !dialog || !deleteConfirmDialog) return () => {}
    const onDialogClick = (event) => {
      dialog.handleDialogClick(event)
    }
    const onDialogClose = () => {
      dialog.handleDialogClose()
    }
    const onDialogCancel = (event) => {
      dialog.handleDialogCancel(event)
    }
    deleteConfirmDialog.addEventListener('click', onDialogClick)
    deleteConfirmDialog.addEventListener('close', onDialogClose)
    deleteConfirmDialog.addEventListener('cancel', onDialogCancel)
    return () => {
      deleteConfirmDialog.removeEventListener('click', onDialogClick)
      deleteConfirmDialog.removeEventListener('close', onDialogClose)
      deleteConfirmDialog.removeEventListener('cancel', onDialogCancel)
    }
  }

  return {
    bindDialogEvents,
    requestConfirmTaskDelete,
    wrapDeleteRequest,
  }
}
