import { overlayStack } from './overlay-stack.js'
import { createPageMenuController } from './page-menu.js'

const createNoopMenuController = () => ({
  bind: () => () => {},
  mount: () => {},
  open: () => {},
  close: () => {},
  toggle: () => {},
  isOpen: () => false,
  containsTarget: () => false,
  setDisabled: () => {},
  dispose: () => {},
})

export const createAnchoredMenuController = ({
  trigger,
  menu,
  stack = overlayStack,
} = {}) => {
  if (!(trigger instanceof HTMLButtonElement)) return createNoopMenuController()
  if (!(menu instanceof HTMLElement)) return createNoopMenuController()

  const pageMenu = createPageMenuController({ trigger, menu })
  let isOpen = false
  let isDisabled = false
  let unbindEvents = () => {}
  let releaseStack = () => {}

  const setExpanded = (expanded) => {
    trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false')
  }

  const release = () => {
    releaseStack()
    releaseStack = () => {}
  }

  const open = () => {
    if (isDisabled) return
    if (isOpen) {
      pageMenu.reposition()
      return
    }
    if (stack && typeof stack.closeAll === 'function') 
      stack.closeAll({ except: api })
    
    pageMenu.open()
    isOpen = true
    setExpanded(true)
    if (stack && typeof stack.register === 'function') 
      releaseStack = stack.register(api)
    
  }

  const close = ({ focusTrigger = false } = {}) => {
    if (!isOpen) return
    isOpen = false
    pageMenu.close()
    setExpanded(false)
    release()
    if (focusTrigger) trigger.focus()
  }

  const toggle = () => {
    if (isOpen) {
      close()
      return
    }
    open()
  }

  const onTriggerClick = (event) => {
    event.preventDefault()
    if (isDisabled) return
    toggle()
  }

  const onDocumentClick = (event) => {
    if (!isOpen) return
    const target = event.target
    if (!(target instanceof Node)) return
    if (trigger.contains(target) || api.containsTarget(target)) return
    close()
  }

  const onDocumentKeydown = (event) => {
    if (event.key !== 'Escape') return
    if (!isOpen) return
    if (stack && typeof stack.isTop === 'function' && !stack.isTop(api)) return
    close({ focusTrigger: true })
  }

  const bind = () => {
    trigger.addEventListener('click', onTriggerClick)
    document.addEventListener('click', onDocumentClick)
    document.addEventListener('keydown', onDocumentKeydown)
    unbindEvents = () => {
      trigger.removeEventListener('click', onTriggerClick)
      document.removeEventListener('click', onDocumentClick)
      document.removeEventListener('keydown', onDocumentKeydown)
      unbindEvents = () => {}
    }
    return unbindEvents
  }

  const setDisabled = (disabled) => {
    isDisabled = Boolean(disabled)
    if (isDisabled) close()
  }

  const dispose = () => {
    close()
    unbindEvents()
    pageMenu.dispose()
  }

  const api = {
    bind,
    mount: () => pageMenu.mount(),
    open,
    close,
    toggle,
    isOpen: () => isOpen,
    containsTarget: (target) => pageMenu.containsTarget(target),
    setDisabled,
    dispose,
  }

  return api
}
