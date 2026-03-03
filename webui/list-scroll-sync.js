const readScrollState = (listEl) => {
  if (!listEl) return null
  const scrollHeight = Number(listEl.scrollHeight) || 0
  const clientHeight = Number(listEl.clientHeight) || 0
  const scrollTop = Number(listEl.scrollTop) || 0
  const distance = scrollHeight - scrollTop - clientHeight
  return { scrollHeight, clientHeight, scrollTop, distance }
}

const getBottomThreshold = (clientHeight, bottomThresholdMultiplier) =>
  clientHeight * bottomThresholdMultiplier

const scheduleFrame = (callback) => {
  if (
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function'
  ) {
    window.requestAnimationFrame(callback)
    return
  }
  callback()
}

export const captureListScrollState = (
  listEl,
  { bottomThresholdMultiplier = 1 } = {},
) => {
  const state = readScrollState(listEl)
  if (!state) return null
  const threshold = getBottomThreshold(state.clientHeight, bottomThresholdMultiplier)
  return {
    ...state,
    wasNearBottom: state.clientHeight === 0 || state.distance <= threshold,
  }
}

export const restoreListScrollState = (
  listEl,
  previousState,
  { preferBottomWhenNear = true } = {},
) => {
  if (!listEl || !previousState) return
  const maxTop = Math.max(0, listEl.scrollHeight - listEl.clientHeight)
  if (preferBottomWhenNear && previousState.wasNearBottom) {
    listEl.scrollTop = maxTop
    return
  }
  if (previousState.scrollTop <= 0) return
  listEl.scrollTop = Math.min(maxTop, previousState.scrollTop)
}

export const createListLayoutShiftSync = ({
  listEl,
  bottomThresholdMultiplier = 1,
}) => {
  let isBound = false
  let syncQueued = false
  let lastClientHeight = 0
  let lastScrollHeight = 0
  let resizeObserver = null
  let mutationObserver = null

  const syncAfterLayoutShift = () => {
    const state = readScrollState(listEl)
    if (!state) return
    const previousClientHeight =
      lastClientHeight > 0 ? lastClientHeight : state.clientHeight
    const previousScrollHeight =
      lastScrollHeight > 0 ? lastScrollHeight : state.scrollHeight
    const previousDistance =
      state.distance -
      (state.scrollHeight - previousScrollHeight) +
      (state.clientHeight - previousClientHeight)
    const previousThreshold = getBottomThreshold(
      previousClientHeight,
      bottomThresholdMultiplier,
    )
    if (previousDistance <= previousThreshold)
      listEl.scrollTop = Math.max(0, state.scrollHeight - state.clientHeight)
    lastClientHeight = state.clientHeight
    lastScrollHeight = state.scrollHeight
  }

  const scheduleSync = () => {
    if (syncQueued) return
    syncQueued = true
    scheduleFrame(() => {
      syncQueued = false
      syncAfterLayoutShift()
    })
  }

  const onLayoutShift = () => {
    scheduleSync()
  }

  const bind = () => {
    if (isBound || !listEl) return
    isBound = true
    lastClientHeight = Number(listEl.clientHeight) || 0
    lastScrollHeight = Number(listEl.scrollHeight) || 0
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function')
      window.addEventListener('resize', onLayoutShift, { passive: true })

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(onLayoutShift)
      resizeObserver.observe(listEl)
    }

    if (typeof MutationObserver === 'function') {
      mutationObserver = new MutationObserver(onLayoutShift)
      mutationObserver.observe(listEl, {
        childList: true,
        subtree: true,
        characterData: true,
      })
    }

    if (typeof listEl.addEventListener === 'function')
      listEl.addEventListener('load', onLayoutShift, true)

    const fonts = typeof document !== 'undefined' ? document.fonts : null
    if (fonts && typeof fonts.addEventListener === 'function') {
      fonts.addEventListener('loadingdone', onLayoutShift)
      fonts.addEventListener('loadingerror', onLayoutShift)
    }

    scheduleSync()
  }

  const dispose = () => {
    if (!isBound) return
    isBound = false
    if (
      typeof window !== 'undefined' &&
      typeof window.removeEventListener === 'function'
    )
      window.removeEventListener('resize', onLayoutShift)

    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    if (mutationObserver) {
      mutationObserver.disconnect()
      mutationObserver = null
    }

    if (listEl && typeof listEl.removeEventListener === 'function')
      listEl.removeEventListener('load', onLayoutShift, true)

    const fonts = typeof document !== 'undefined' ? document.fonts : null
    if (fonts && typeof fonts.removeEventListener === 'function') {
      fonts.removeEventListener('loadingdone', onLayoutShift)
      fonts.removeEventListener('loadingerror', onLayoutShift)
    }
  }

  return {
    bind,
    dispose,
    scheduleSync,
    syncAfterLayoutShift,
  }
}
