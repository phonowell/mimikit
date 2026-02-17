const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const createDialogController = ({
  dialog,
  trigger,
  focusOnOpen,
  focusOnClose,
  closeAnimationMs = 140,
  onOpen,
  onBeforeClose,
  onAfterClose,
} = {}) => {
  const reducedMotion = prefersReducedMotion()
  let isOpen = false
  let closeTimer = null
  let closeAnimationHandler = null

  const setExpanded = (nextOpen) => {
    if (!trigger) return
    trigger.setAttribute('aria-expanded', nextOpen ? 'true' : 'false')
  }

  const clearClosingState = () => {
    if (!dialog) return
    dialog.classList.remove('is-closing')
    if (closeAnimationHandler) {
      dialog.removeEventListener('animationend', closeAnimationHandler)
      closeAnimationHandler = null
    }
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
  }

  const finalizeClose = () => {
    if (!isOpen) return
    isOpen = false
    setExpanded(false)
    clearClosingState()
    if (typeof onAfterClose === 'function') onAfterClose()
    if (focusOnClose) focusOnClose.focus()
  }

  const performClose = () => {
    if (!dialog) return
    if (typeof dialog.close === 'function') 
      dialog.close()
     else {
      dialog.removeAttribute('open')
      finalizeClose()
    }
  }

  const open = () => {
    if (!dialog) return
    if (dialog.classList.contains('is-closing')) {
      clearClosingState()
      return
    }
    if (isOpen) return
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal()
    } else 
      dialog.setAttribute('open', '')
    
    isOpen = true
    setExpanded(true)
    if (typeof onOpen === 'function') onOpen()
    if (focusOnOpen) {
      window.requestAnimationFrame(() => {
        focusOnOpen.focus()
      })
    }
  }

  const close = () => {
    if (!dialog || !isOpen) return
    if (dialog.classList.contains('is-closing')) return
    if (reducedMotion) {
      if (typeof onBeforeClose === 'function') onBeforeClose()
      performClose()
      return
    }
    if (typeof onBeforeClose === 'function') onBeforeClose()
    dialog.classList.add('is-closing')
    const onAnimationEnd = (event) => {
      if (event.target !== dialog) return
      if (closeAnimationHandler) {
        dialog.removeEventListener('animationend', closeAnimationHandler)
        closeAnimationHandler = null
      }
      if (closeTimer) {
        clearTimeout(closeTimer)
        closeTimer = null
      }
      performClose()
    }
    closeAnimationHandler = onAnimationEnd
    dialog.addEventListener('animationend', onAnimationEnd)
    closeTimer = window.setTimeout(() => {
      if (closeAnimationHandler) {
        dialog.removeEventListener('animationend', closeAnimationHandler)
        closeAnimationHandler = null
      }
      performClose()
    }, closeAnimationMs + 40)
  }

  const handleDialogClick = (event) => {
    if (event.target === dialog) close()
  }

  const handleDialogClose = () => {
    if (!isOpen) return
    finalizeClose()
  }

  const handleDialogCancel = (event) => {
    event.preventDefault()
    close()
  }

  return {
    open,
    close,
    setExpanded,
    handleDialogClick,
    handleDialogClose,
    handleDialogCancel,
    isOpen: () => isOpen,
  }
}
