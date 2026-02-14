export const createScrollController = ({
  messagesEl,
  scrollBottomBtn,
  scrollBottomMultiplier = 1.5,
}) => {
  let scrollBound = false

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

  const isNearBottom = () => {
    const state = getScrollState()
    if (!state || state.clientHeight === 0) return true
    return state.distance <= getBottomThreshold(state.clientHeight)
  }

  const setScrollButtonVisible = (visible) => {
    if (!scrollBottomBtn) return
    if (!visible && document.activeElement === scrollBottomBtn) {
      scrollBottomBtn.blur()
    }
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

  const bindScrollControls = () => {
    if (!messagesEl || scrollBound) return
    scrollBound = true
    messagesEl.addEventListener(
      'scroll',
      () => {
        updateScrollButton()
      },
      { passive: true },
    )
    window.addEventListener('resize', updateScrollButton)
    if (scrollBottomBtn) {
      scrollBottomBtn.addEventListener('click', () => {
        scrollToBottom({ smooth: true })
        setScrollButtonVisible(false)
      })
    }
    updateScrollButton()
  }

  return { isNearBottom, scrollToBottom, updateScrollButton, bindScrollControls }
}
