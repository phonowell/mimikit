const DRAFT_STORAGE_KEY = 'mimikit:webui:composer-draft'
let hasWarnedDraftStorage = false

const warnDraftStorage = (error) => {
  if (hasWarnedDraftStorage) return
  hasWarnedDraftStorage = true
  const message = error instanceof Error ? error.message : String(error)
  console.warn('[webui] draft storage unavailable', message)
}

const readDraft = () => {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(DRAFT_STORAGE_KEY) ?? ''
  } catch (error) {
    warnDraftStorage(error)
    return ''
  }
}

const writeDraft = (value) => {
  if (typeof window === 'undefined') return
  try {
    if (value) window.localStorage.setItem(DRAFT_STORAGE_KEY, value)
    else window.localStorage.removeItem(DRAFT_STORAGE_KEY)
  } catch (error) {
    warnDraftStorage(error)
  }
}

export function bindComposer({ form, input, messages }) {
  if (!form || !input || !messages) return

  const resizeInput = () => {
    input.style.height = 'auto'
    const computed = window.getComputedStyle(input)
    const borderTop = Number.parseFloat(computed.borderTopWidth) || 0
    const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0
    const maxHeight = Number.parseFloat(computed.maxHeight) || 0
    const nextHeight = input.scrollHeight + borderTop + borderBottom
    if (maxHeight > 0) {
      input.style.height = `${Math.min(nextHeight, maxHeight)}px`
      input.style.overflowY = nextHeight > maxHeight ? 'auto' : 'hidden'
    } else {
      input.style.height = `${nextHeight}px`
      input.style.overflowY = 'hidden'
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const text = input.value.trim()
    if (text) messages.sendMessage(text)
  })

  const draft = readDraft()
  if (!input.value && draft) input.value = draft
  resizeInput()
  input.addEventListener('input', () => {
    resizeInput()
    writeDraft(input.value)
  })

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      form.requestSubmit()
    }
  })
}
