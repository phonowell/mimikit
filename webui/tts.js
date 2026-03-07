const TTS_STORAGE_KEY = 'mimikit-webui-tts-enabled'
const TTS_STORAGE_ENABLED = '1'
const TTS_STORAGE_DISABLED = '0'
const MAX_SPEAK_CHARS = 2000

const TTS_LABEL_ENABLED = 'Voice replies: on'
const TTS_LABEL_DISABLED = 'Voice replies: off'
const TTS_LABEL_UNAVAILABLE = 'Voice replies: unavailable'

let hasWarnedTtsStorage = false

const warnTtsStorage = (error) => {
  if (hasWarnedTtsStorage) return
  hasWarnedTtsStorage = true
  const message = error instanceof Error ? error.message : String(error)
  console.warn('[webui] tts storage unavailable', message)
}

const readStoredEnabled = () => {
  if (
    typeof window === 'undefined' ||
    !window.localStorage ||
    typeof window.localStorage.getItem !== 'function'
  )
    return false
  try {
    return window.localStorage.getItem(TTS_STORAGE_KEY) === TTS_STORAGE_ENABLED
  } catch (error) {
    warnTtsStorage(error)
    return false
  }
}

const writeStoredEnabled = (enabled) => {
  if (
    typeof window === 'undefined' ||
    !window.localStorage ||
    typeof window.localStorage.setItem !== 'function'
  )
    return
  try {
    window.localStorage.setItem(
      TTS_STORAGE_KEY,
      enabled ? TTS_STORAGE_ENABLED : TTS_STORAGE_DISABLED,
    )
  } catch (error) {
    warnTtsStorage(error)
  }
}

const closeToolsMenu = (toolsToggleBtn) => {
  if (!toolsToggleBtn) return
  const expanded = toolsToggleBtn.getAttribute('aria-expanded')
  if (expanded !== 'true') return
  if (typeof toolsToggleBtn.click === 'function') toolsToggleBtn.click()
  else toolsToggleBtn.setAttribute('aria-expanded', 'false')
}

const toSpeakText = (value) => {
  if (typeof value !== 'string') return ''
  const withoutCodeBlocks = value.replace(/```[\s\S]*?```/g, ' ')
  const withoutInlineCode = withoutCodeBlocks.replace(/`([^`]+)`/g, '$1')
  const compact = withoutInlineCode.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  if (compact.length <= MAX_SPEAK_CHARS) return compact
  return `${compact.slice(0, MAX_SPEAK_CHARS)}...`
}

const isSpeechSupported = () =>
  typeof window !== 'undefined' &&
  typeof window.speechSynthesis !== 'undefined' &&
  typeof window.SpeechSynthesisUtterance !== 'undefined'

export const bindTts = ({ toolsTtsBtn, toolsToggleBtn } = {}) => {
  if (!toolsTtsBtn) {
    return {
      speakMessages: () => {},
      isEnabled: () => false,
      dispose: () => {},
    }
  }

  const supported = isSpeechSupported()
  let enabled = supported && readStoredEnabled()
  let speaking = false
  let queue = []
  let currentUtterance = null

  const updateButton = () => {
    if (!supported) {
      toolsTtsBtn.disabled = true
      toolsTtsBtn.textContent = TTS_LABEL_UNAVAILABLE
      toolsTtsBtn.setAttribute('title', TTS_LABEL_UNAVAILABLE)
      toolsTtsBtn.setAttribute('aria-label', TTS_LABEL_UNAVAILABLE)
      toolsTtsBtn.setAttribute('aria-checked', 'false')
      return
    }

    const label = enabled ? TTS_LABEL_ENABLED : TTS_LABEL_DISABLED
    toolsTtsBtn.disabled = false
    toolsTtsBtn.textContent = label
    toolsTtsBtn.setAttribute('title', label)
    toolsTtsBtn.setAttribute('aria-label', label)
    toolsTtsBtn.setAttribute('aria-checked', enabled ? 'true' : 'false')
  }

  const playNext = () => {
    if (!supported || !enabled || speaking) return
    const nextText = queue.shift()
    if (!nextText) return

    speaking = true
    const utterance = new window.SpeechSynthesisUtterance(nextText)
    currentUtterance = utterance

    utterance.onend = () => {
      speaking = false
      currentUtterance = null
      playNext()
    }

    utterance.onerror = (event) => {
      console.warn('[webui] tts speak failed', event?.error ?? 'unknown')
      speaking = false
      currentUtterance = null
      playNext()
    }

    try {
      window.speechSynthesis.speak(utterance)
    } catch (error) {
      console.warn('[webui] tts speak failed', error)
      speaking = false
      currentUtterance = null
      playNext()
    }
  }

  const stopAll = () => {
    queue = []
    speaking = false
    currentUtterance = null
    if (supported) window.speechSynthesis.cancel()
  }

  const speakMessages = (messages) => {
    if (!supported || !enabled) return
    const items = Array.isArray(messages) ? messages : []
    if (items.length === 0) return

    for (const message of items) {
      const text = toSpeakText(message?.text)
      if (!text) continue
      queue.push(text)
    }

    if (!currentUtterance) playNext()
  }

  const toggle = () => {
    if (!supported) return
    enabled = !enabled
    writeStoredEnabled(enabled)
    if (!enabled) stopAll()
    else playNext()
    updateButton()
  }

  const onToggle = (event) => {
    event.preventDefault()
    if (toolsTtsBtn.disabled) return
    toggle()
    closeToolsMenu(toolsToggleBtn)
  }

  toolsTtsBtn.addEventListener('click', onToggle)
  if (supported) window.speechSynthesis.getVoices()
  updateButton()

  return {
    speakMessages,
    isEnabled: () => enabled,
    dispose: () => {
      toolsTtsBtn.removeEventListener('click', onToggle)
      stopAll()
    },
  }
}
