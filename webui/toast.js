const TOAST_HIDE_DELAY_MS = 2800

const ensureToastElement = () => {
  const existing = document.querySelector('[data-toast]')
  if (existing instanceof HTMLElement) return existing

  const toast = document.createElement('div')
  toast.className = 'app-toast'
  toast.setAttribute('data-toast', 'true')
  toast.setAttribute('role', 'status')
  toast.setAttribute('aria-live', 'polite')
  toast.setAttribute('aria-atomic', 'true')
  toast.hidden = true
  document.body.appendChild(toast)
  return toast
}

export const createToastController = () => {
  let hideTimer = null
  const toastEl = ensureToastElement()
  let isDisabled = false

  const clearHideTimer = () => {
    if (!hideTimer) return
    window.clearTimeout(hideTimer)
    hideTimer = null
  }

  const hide = () => {
    clearHideTimer()
    toastEl.hidden = true
    toastEl.textContent = ''
    toastEl.dataset.state = ''
  }

  const show = (message, state = '') => {
    if (isDisabled) return
    const text = typeof message === 'string' ? message.trim() : ''
    if (!text) return
    clearHideTimer()
    toastEl.hidden = false
    toastEl.textContent = text
    toastEl.dataset.state = state || ''
    hideTimer = window.setTimeout(() => {
      hide()
    }, TOAST_HIDE_DELAY_MS)
  }

  return {
    bind: () => () => {},
    mount: () => {},
    open: (message, state = '') => show(message, state),
    close: hide,
    show,
    hide,
    setDisabled: (disabled) => {
      isDisabled = Boolean(disabled)
      if (isDisabled) hide()
    },
    dispose: hide,
  }
}
