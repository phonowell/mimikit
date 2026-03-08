const DEFAULT_GAP_PX = 6
const DEFAULT_VIEWPORT_PADDING_PX = 8
const DEFAULT_Z_INDEX = 20

const clamp = (value, min, max) => {
  if (value < min) return min
  if (value > max) return max
  return value
}

const createNoopController = () => ({
  open: () => {},
  close: () => {},
  destroy: () => {},
  isOpen: () => false,
  containsTarget: () => false,
  reposition: () => {},
})

export const createPageMenuController = ({
  trigger,
  menu,
  gapPx = DEFAULT_GAP_PX,
  viewportPaddingPx = DEFAULT_VIEWPORT_PADDING_PX,
  zIndex = DEFAULT_Z_INDEX,
} = {}) => {
  if (!(trigger instanceof HTMLElement)) return createNoopController()
  if (!(menu instanceof HTMLElement)) return createNoopController()

  const restoreParent = menu.parentElement
  const restoreNextSibling = menu.nextSibling
  let isOpen = false
  let rafId = 0

  const resolvePortalRoot = () => {
    const dialogRoot = trigger.closest('dialog[open]')
    if (dialogRoot instanceof HTMLDialogElement) return dialogRoot
    return document.body
  }

  const cancelPositionFrame = () => {
    if (rafId <= 0) return
    window.cancelAnimationFrame(rafId)
    rafId = 0
  }

  const restoreMenuNode = () => {
    if (!(menu instanceof HTMLElement)) return
    if (!(restoreParent instanceof HTMLElement) || !restoreParent.isConnected) {
      menu.remove()
      return
    }

    if (restoreNextSibling instanceof Node && restoreNextSibling.parentNode === restoreParent) {
      restoreParent.insertBefore(menu, restoreNextSibling)
      return
    }

    restoreParent.appendChild(menu)
  }

  const applyFloatingStyle = () => {
    menu.style.position = 'fixed'
    menu.style.left = '0px'
    menu.style.top = '0px'
    menu.style.right = 'auto'
    menu.style.margin = '0'
    menu.style.zIndex = String(zIndex)
  }

  const clearFloatingStyle = () => {
    menu.style.position = ''
    menu.style.left = ''
    menu.style.top = ''
    menu.style.right = ''
    menu.style.margin = ''
    menu.style.zIndex = ''
  }

  const updatePosition = () => {
    if (!isOpen) return
    if (!trigger.isConnected || !menu.isConnected) {
      close()
      return
    }

    const triggerRect = trigger.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const minLeft = viewportPaddingPx
    const maxLeft = Math.max(minLeft, viewportWidth - menuRect.width - viewportPaddingPx)
    let left = triggerRect.right - menuRect.width
    left = clamp(left, minLeft, maxLeft)

    const minTop = viewportPaddingPx
    const maxTop = Math.max(minTop, viewportHeight - menuRect.height - viewportPaddingPx)
    const topByBottom = triggerRect.bottom + gapPx
    const topByTop = triggerRect.top - menuRect.height - gapPx

    let top = topByBottom
    if (topByBottom > maxTop && topByTop >= minTop) top = topByTop
    top = clamp(top, minTop, maxTop)

    menu.style.left = `${Math.round(left)}px`
    menu.style.top = `${Math.round(top)}px`
  }

  const requestPositionUpdate = () => {
    cancelPositionFrame()
    rafId = window.requestAnimationFrame(() => {
      rafId = 0
      updatePosition()
    })
  }

  const onViewportChange = () => {
    requestPositionUpdate()
  }

  const open = () => {
    if (isOpen) {
      requestPositionUpdate()
      return
    }

    isOpen = true
    const portalRoot = resolvePortalRoot()
    if (menu.parentElement !== portalRoot) portalRoot.appendChild(menu)
    applyFloatingStyle()
    menu.hidden = false
    menu.dataset.pageMenuOpen = 'true'
    requestPositionUpdate()
    window.addEventListener('resize', onViewportChange)
    document.addEventListener('scroll', onViewportChange, true)
  }

  const close = () => {
    cancelPositionFrame()
    if (!isOpen) {
      menu.hidden = true
      clearFloatingStyle()
      restoreMenuNode()
      return
    }

    isOpen = false
    window.removeEventListener('resize', onViewportChange)
    document.removeEventListener('scroll', onViewportChange, true)
    menu.hidden = true
    delete menu.dataset.pageMenuOpen
    clearFloatingStyle()
    restoreMenuNode()
  }

  return {
    open,
    close,
    destroy: () => {
      close()
    },
    isOpen: () => isOpen,
    containsTarget: (target) => target instanceof Node && menu.contains(target),
    reposition: requestPositionUpdate,
  }
}
