export const createScrollController = ({
  messagesEl,
  scrollBottomBtn,
  scrollBottomMultiplier = 1.5,
}) => {
  let scrollBound = false
  let lastClientHeight = 0
  let lastScrollHeight = 0
  let syncQueued = false
  let pendingStickToBottom = false

  const getScrollState = () => {
    if (!messagesEl) return null
    const scrollHeight = messagesEl.scrollHeight
    const clientHeight = messagesEl.clientHeight
    const scrollTop = messagesEl.scrollTop
    const distance = scrollHeight - scrollTop - clientHeight
    return { scrollHeight, clientHeight, scrollTop, distance }
  }

  const getBottomThreshold = (clientHeight) =>
    clientHeight * scrollBottomMultiplier

  const scheduleSyncAfterLayoutShift = ({ stickToBottom = false } = {}) => {
    if (stickToBottom) pendingStickToBottom = true
    if (syncQueued) return
    syncQueued = true
    const flush = () => {
      syncQueued = false
      const shouldStick = pendingStickToBottom
      pendingStickToBottom = false
      syncAfterLayoutShift({ stickToBottom: shouldStick })
    }
    if (
      typeof window !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
    ) {
      window.requestAnimationFrame(flush)
      return
    }
    flush()
  }

  const isNearBottom = () => {
    const state = getScrollState()
    if (!state || state.clientHeight === 0) return true
    return state.distance <= getBottomThreshold(state.clientHeight)
  }

  const setScrollButtonVisible = (visible) => {
    if (!scrollBottomBtn) return
    if (!visible && document.activeElement === scrollBottomBtn) 
      scrollBottomBtn.blur()
    
    scrollBottomBtn.classList.toggle('is-visible', visible)
    if (visible) {
      scrollBottomBtn.removeAttribute('aria-hidden')
      scrollBottomBtn.removeAttribute('inert')
    } else {
      scrollBottomBtn.setAttribute('aria-hidden', 'true')
      scrollBottomBtn.setAttribute('inert', '')
    }
    scrollBottomBtn.tabIndex = visible ? 0 : -1
  }

  const updateScrollButton = () => {
    if (!scrollBottomBtn || !messagesEl) return
    const state = getScrollState()
    if (!state || state.clientHeight === 0) {
      setScrollButtonVisible(false)
      return
    }
    const threshold = getBottomThreshold(state.clientHeight)
    setScrollButtonVisible(state.distance > threshold)
  }

  const scrollToBottom = ({ smooth = true } = {}) => {
    if (!messagesEl) return
    const reduceMotion =
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const behavior = smooth && !reduceMotion ? 'smooth' : 'auto'
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior })
  }

  const syncAfterLayoutShift = ({ stickToBottom = false } = {}) => {
    if (!messagesEl) return
    const state = getScrollState()
    if (!state) return
    const previousClientHeight =
      lastClientHeight > 0 ? lastClientHeight : state.clientHeight
    const previousScrollHeight =
      lastScrollHeight > 0 ? lastScrollHeight : state.scrollHeight
    const didHeightChange = state.clientHeight !== previousClientHeight
    const didScrollHeightChange = state.scrollHeight !== previousScrollHeight
    const previousDistance =
      state.distance -
      (state.scrollHeight - previousScrollHeight) +
      (state.clientHeight - previousClientHeight)
    const previousThreshold = getBottomThreshold(previousClientHeight)
    const shouldStickByLayoutShift =
      (didHeightChange || didScrollHeightChange) &&
      previousDistance <= previousThreshold
    lastClientHeight = state.clientHeight
    lastScrollHeight = state.scrollHeight
    if (stickToBottom || shouldStickByLayoutShift) scrollToBottom({ smooth: false })
    updateScrollButton()
  }

  const bindScrollControls = () => {
    if (!messagesEl || scrollBound) return
    scrollBound = true
    lastClientHeight = messagesEl.clientHeight
    lastScrollHeight = messagesEl.scrollHeight
    const onLayoutShift = () => {
      scheduleSyncAfterLayoutShift()
    }
    messagesEl.addEventListener(
      'scroll',
      () => {
        updateScrollButton()
      },
      { passive: true },
    )
    window.addEventListener('resize', onLayoutShift, { passive: true })
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(onLayoutShift)
      observer.observe(messagesEl)
    }
    if (typeof MutationObserver === 'function') {
      const mutationObserver = new MutationObserver(onLayoutShift)
      mutationObserver.observe(messagesEl, {
        childList: true,
        subtree: true,
        characterData: true,
      })
    }
    messagesEl.addEventListener('load', onLayoutShift, true)
    const fonts = typeof document !== 'undefined' ? document.fonts : null
    if (fonts && typeof fonts.addEventListener === 'function') {
      fonts.addEventListener('loadingdone', onLayoutShift)
      fonts.addEventListener('loadingerror', onLayoutShift)
    }
    if (scrollBottomBtn) {
      scrollBottomBtn.addEventListener('click', () => {
        scrollToBottom({ smooth: true })
        setScrollButtonVisible(false)
      })
    }
    scheduleSyncAfterLayoutShift()
  }

  return {
    isNearBottom,
    scrollToBottom,
    updateScrollButton,
    bindScrollControls,
    syncAfterLayoutShift,
  }
}
