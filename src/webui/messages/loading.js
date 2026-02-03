export const createLoadingController = ({
  messagesEl,
  isNearBottom,
  scrollToBottom,
  updateScrollButton,
  removeEmpty,
}) => {
  let loadingItem = null
  let showLoading = false

  const ensureLoadingPlaceholder = () => {
    if (!messagesEl) return
    if (loadingItem && loadingItem.isConnected) return
    const shouldAutoScroll = isNearBottom()
    removeEmpty()
    const item = document.createElement('li')
    item.className = 'message agent message-loading'

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

    article.appendChild(content)
    item.appendChild(article)
    messagesEl.appendChild(item)
    loadingItem = item
    if (shouldAutoScroll) scrollToBottom({ smooth: false })
    updateScrollButton()
  }

  const removeLoadingPlaceholder = () => {
    if (loadingItem && loadingItem.isConnected) loadingItem.remove()
    loadingItem = null
    updateScrollButton()
  }

  const setLoading = (active) => {
    showLoading = active
    if (active) {
      ensureLoadingPlaceholder()
    } else {
      removeLoadingPlaceholder()
    }
  }

  const isLoading = () => showLoading

  return { setLoading, isLoading, ensureLoadingPlaceholder }
}
