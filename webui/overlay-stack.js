const isOpenOverlay = (overlay) =>
  Boolean(overlay && typeof overlay.isOpen === 'function' && overlay.isOpen())

const closeOverlay = (overlay, options = {}) => {
  if (!overlay || typeof overlay.close !== 'function') return false
  overlay.close(options)
  return true
}

export const createOverlayStack = () => {
  const overlays = []

  const remove = (overlay) => {
    if (!overlay) return
    const index = overlays.lastIndexOf(overlay)
    if (index < 0) return
    overlays.splice(index, 1)
  }

  const removeClosed = () => {
    for (let index = overlays.length - 1; index >= 0; index -= 1) {
      if (isOpenOverlay(overlays[index])) continue
      overlays.splice(index, 1)
    }
  }

  const register = (overlay) => {
    if (!overlay) return () => {}
    removeClosed()
    remove(overlay)
    overlays.push(overlay)
    return () => {
      remove(overlay)
    }
  }

  const closeTop = (options = {}) => {
    removeClosed()
    for (let index = overlays.length - 1; index >= 0; index -= 1) {
      const overlay = overlays[index]
      if (!isOpenOverlay(overlay)) continue
      closeOverlay(overlay, options)
      removeClosed()
      return true
    }
    return false
  }

  const closeAll = ({ except = null, options = {} } = {}) => {
    removeClosed()
    const snapshot = overlays.slice()
    for (let index = snapshot.length - 1; index >= 0; index -= 1) {
      const overlay = snapshot[index]
      if (!overlay || overlay === except) continue
      closeOverlay(overlay, options)
    }
    removeClosed()
  }

  const isTop = (overlay) => {
    removeClosed()
    const top = overlays.at(-1)
    return top === overlay
  }

  return {
    register,
    remove,
    closeTop,
    closeAll,
    isTop,
  }
}

export const overlayStack = createOverlayStack()
