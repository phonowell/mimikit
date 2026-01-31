export const createLoadingController = ({
  messagesEl,
  isNearBottom,
  scrollToBottom,
  updateScrollButton,
  removeEmpty,
  formatElapsedLabel,
  loadingTimeThreshold = 3000,
}) => {
  let loadingItem = null
  let loadingTimeEl = null
  let loadingStartAt = null
  let loadingTimer = null
  let showLoading = false

  const ensureLoadingPlaceholder = () => {
    if (!messagesEl) return
    if (loadingItem && loadingItem.isConnected) return
    const shouldAutoScroll = isNearBottom()
    removeEmpty()
    const item = document.createElement('li')
    item.className = 'message assistant message-loading'

    const article = document.createElement('article')
    const content = document.createElement('div')
    content.className = 'content loading-dots'
    content.setAttribute('role', 'status')
    content.setAttribute('aria-label', 'Loading')

    for (let i = 0; i < 3; i += 1) {
      const dot = document.createElement('span')
      dot.className = 'dot'
      content.appendChild(dot)
    }

    const time = document.createElement('span')
    time.className = 'loading-time'
    time.setAttribute('aria-live', 'polite')
    content.appendChild(time)

    article.appendChild(content)
    item.appendChild(article)
    messagesEl.appendChild(item)
    loadingItem = item
    loadingTimeEl = time
    updateLoadingElapsed()
    if (shouldAutoScroll) scrollToBottom({ smooth: false })
    updateScrollButton()
  }

  const removeLoadingPlaceholder = () => {
    if (loadingItem && loadingItem.isConnected) loadingItem.remove()
    loadingItem = null
    loadingTimeEl = null
    updateScrollButton()
  }

  const updateLoadingElapsed = () => {
    if (!loadingStartAt || !loadingTimeEl) return
    const elapsed = Date.now() - loadingStartAt
    if (elapsed < loadingTimeThreshold) {
      loadingTimeEl.textContent = ''
      loadingTimeEl.classList.remove('is-visible')
      return
    }
    const label = formatElapsedLabel(elapsed)
    loadingTimeEl.textContent = label ? `Waiting ${label}` : ''
    loadingTimeEl.classList.add('is-visible')
  }

  const startLoadingTimer = () => {
    if (loadingTimer) return
    loadingTimer = window.setInterval(updateLoadingElapsed, 500)
  }

  const stopLoadingTimer = () => {
    if (loadingTimer) clearInterval(loadingTimer)
    loadingTimer = null
    loadingStartAt = null
  }

  const setLoading = (active) => {
    const wasLoading = showLoading
    showLoading = active
    if (active) {
      if (!wasLoading) loadingStartAt = Date.now()
      ensureLoadingPlaceholder()
      startLoadingTimer()
    } else {
      stopLoadingTimer()
      removeLoadingPlaceholder()
    }
  }

  const isLoading = () => showLoading

  return { setLoading, isLoading, ensureLoadingPlaceholder }
}
