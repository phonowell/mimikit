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

  const updateQuotePreview = () => {
    if (!quotePreview || !quoteText) return
    if (!activeQuote) {
      quoteText.textContent = ''
      quotePreview.hidden = true
      return
    }
    const preview = formatQuotePreview(activeQuote.text)
    quoteText.textContent = preview
      ? `${activeQuote.id} | ${preview}`
      : activeQuote.id
    quotePreview.hidden = false
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
