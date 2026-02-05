const cleanText = (text) => String(text ?? '').replace(/\s+/g, ' ').trim()

const formatQuotePreview = (text) => {
  const cleaned = cleanText(text)
  if (!cleaned) return ''
  const max = 80
  return cleaned.length > max ? `${cleaned.slice(0, max)}...` : cleaned
}

export const createQuoteController = ({
  quotePreview,
  quoteText,
  input,
} = {}) => {
  let activeQuote = null
  let hideTimer = null

  const setVisibility = (visible) => {
    if (!quotePreview) return
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    if (visible) {
      quotePreview.hidden = false
      quotePreview.setAttribute('aria-hidden', 'false')
      requestAnimationFrame(() => {
        quotePreview.classList.add('is-visible')
      })
      return
    }
    if (quotePreview.hidden) return
    quotePreview.setAttribute('aria-hidden', 'true')
    quotePreview.classList.remove('is-visible')
    const finalize = () => {
      if (quotePreview.classList.contains('is-visible')) return
      quotePreview.hidden = true
    }
    quotePreview.addEventListener('transitionend', finalize, { once: true })
    hideTimer = setTimeout(finalize, 240)
  }

  const updateQuotePreview = () => {
    if (!quotePreview || !quoteText) return
    if (!activeQuote) {
      quoteText.textContent = ''
      setVisibility(false)
      return
    }
    const preview = formatQuotePreview(activeQuote.text)
    quoteText.textContent = preview
      ? `${activeQuote.id} | ${preview}`
      : activeQuote.id
    setVisibility(true)
  }

  const clear = () => {
    if (!activeQuote) return
    activeQuote = null
    updateQuotePreview()
  }

  const set = (msg) => {
    const id = msg?.id
    if (!id) return
    activeQuote = { id: String(id), text: msg?.text ?? '' }
    updateQuotePreview()
    if (input) input.focus()
  }

  const getActive = () => activeQuote

  updateQuotePreview()

  return { clear, set, getActive }
}
