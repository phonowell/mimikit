import { bindDialogControls } from './dialog.js'

export const bindRestartDialog = ({
  dialog,
  openBtn,
  cancelBtn,
  confirmBtn,
  dialogController,
  onOpen,
  onCancel,
  onConfirm,
}) => {
  if (dialogController && dialog && openBtn) {
    const unbindDialogControls = bindDialogControls({
      dialog,
      openBtn,
      closeBtn: cancelBtn,
      controller: dialogController,
      onOpen,
      onClose: onCancel,
    })
    confirmBtn?.addEventListener('click', onConfirm)
    return {
      unbind: unbindDialogControls,
      dispose: () => {
        confirmBtn?.removeEventListener('click', onConfirm)
      },
    }
  }

  if (!openBtn) return { unbind: () => {}, dispose: () => {} }
  openBtn.addEventListener('click', onOpen)
  return {
    unbind: () => {
      openBtn.removeEventListener('click', onOpen)
    },
    dispose: () => {},
  }
}
