import { createDialogController } from './dialog.js'

const hasWindowConfirm = () =>
  typeof window !== 'undefined' &&
  typeof window.confirm === 'function'

const openNativeConfirm = (message) => {
  if (!hasWindowConfirm()) return true
  return window.confirm(message)
}

const createNoopController = ({ fallbackMessage = '' } = {}) => ({
  bindEvents: () => () => {},
  bind: () => () => {},
  mount: () => {},
  close: () => {},
  isOpen: () => false,
  setActionsDisabled: () => {},
  setDisabled: () => {},
  dispose: () => {},
  request: ({ fallbackMessage: nextFallbackMessage } = {}) =>
    Promise.resolve(
      openNativeConfirm(nextFallbackMessage || fallbackMessage),
    ),
})

export const createConfirmDialogController = ({
  dialog,
  cancelBtn,
  confirmBtn,
  fallbackMessage = '',
} = {}) => {
  const enabled = Boolean(dialog && cancelBtn && confirmBtn)
  if (!enabled) return createNoopController({ fallbackMessage })

  let pendingResolve = null
  let isBound = false
  let isDisabled = false

  const dialogController = createDialogController({
    dialog,
    focusOnOpen: cancelBtn,
    onAfterClose: () => {
      if (!pendingResolve) return
      const resolve = pendingResolve
      pendingResolve = null
      resolve(false)
    },
  })

  const clearPendingResolve = (value) => {
    if (!pendingResolve) return
    const resolve = pendingResolve
    pendingResolve = null
    resolve(value)
  }

  const onDialogClick = (event) => {
    dialogController.handleDialogClick(event)
  }

  const onDialogClose = () => {
    dialogController.handleDialogClose()
  }

  const onDialogCancel = (event) => {
    dialogController.handleDialogCancel(event)
  }

  const onCancel = (event) => {
    event.preventDefault()
    if (isDisabled || cancelBtn.disabled || confirmBtn.disabled) return
    clearPendingResolve(false)
    dialogController.close()
  }

  const onConfirm = (event) => {
    event.preventDefault()
    if (isDisabled || cancelBtn.disabled || confirmBtn.disabled) return
    clearPendingResolve(true)
    dialogController.close()
  }

  const bindEvents = () => {
    if (isBound) 
      return () => {}
    
    isBound = true
    dialog.addEventListener('click', onDialogClick)
    dialog.addEventListener('close', onDialogClose)
    dialog.addEventListener('cancel', onDialogCancel)
    cancelBtn.addEventListener('click', onCancel)
    confirmBtn.addEventListener('click', onConfirm)
    return () => {
      if (!isBound) return
      isBound = false
      dialog.removeEventListener('click', onDialogClick)
      dialog.removeEventListener('close', onDialogClose)
      dialog.removeEventListener('cancel', onDialogCancel)
      cancelBtn.removeEventListener('click', onCancel)
      confirmBtn.removeEventListener('click', onConfirm)
    }
  }

  const setActionsDisabled = (disabled) => {
    cancelBtn.disabled = disabled
    confirmBtn.disabled = disabled
  }

  const setDisabled = (disabled) => {
    isDisabled = Boolean(disabled)
    setActionsDisabled(isDisabled)
    if (isDisabled) {
      clearPendingResolve(false)
      dialogController.close()
    }
  }

  return {
    bind: bindEvents,
    mount: () => {},
    bindEvents,
    close: () => {
      dialogController.close()
    },
    isOpen: () => dialogController.isOpen(),
    setActionsDisabled,
    setDisabled,
    dispose: () => {
      setDisabled(true)
    },
    request: () => {
      if (isDisabled) return Promise.resolve(false)
      if (pendingResolve) 
        clearPendingResolve(false)
      
      dialogController.open()
      return new Promise((resolve) => {
        pendingResolve = resolve
      })
    },
  }
}
