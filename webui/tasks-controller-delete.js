import { createConfirmDialogController } from './confirm-dialog.js'
import { UI_TEXT } from './system-text.js'

const readTaskId = (value) =>
  typeof value === 'string' ? value.trim() : ''

export const createTaskDeleteController = ({
  deleteConfirmDialog,
  deleteConfirmCancelBtn,
  deleteConfirmBtn,
} = {}) => {
  let isDeletePending = false
  const confirmDialog = createConfirmDialogController({
    dialog: deleteConfirmDialog,
    cancelBtn: deleteConfirmCancelBtn,
    confirmBtn: deleteConfirmBtn,
    fallbackMessage: UI_TEXT.deleteTaskConfirmPrompt,
  })

  const requestConfirmTaskDelete = async (taskId) => {
    const normalizedTaskId = readTaskId(taskId)
    if (!normalizedTaskId) return false
    if (isDeletePending) return false
    return confirmDialog.request()
  }

  const wrapDeleteRequest = async (run) => {
    if (isDeletePending) return false
    isDeletePending = true
    confirmDialog.setActionsDisabled(true)
    try {
      return await run()
    } finally {
      isDeletePending = false
      confirmDialog.setActionsDisabled(false)
    }
  }

  const bindDialogEvents = () => {
    return confirmDialog.bindEvents()
  }

  return {
    bindDialogEvents,
    requestConfirmTaskDelete,
    wrapDeleteRequest,
  }
}
