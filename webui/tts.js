import { renderMarkdown } from './markdown.js'
import { createTtsPlayer } from './tts-player.js'
import { resolveLatestSpeakText } from './tts-text.js'
import { resolvePreferredTtsVoice } from './tts-voice.js'

const TTS_STORAGE_KEY = 'mimikit-webui-tts-enabled'
const TTS_STORAGE_ENABLED = '1'
const TTS_STORAGE_DISABLED = '0'
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
  const player = createTtsPlayer({
    speechSynthesis: supported ? window.speechSynthesis : undefined,
    SpeechSynthesisUtterance: supported
      ? window.SpeechSynthesisUtterance
      : undefined,
    resolveVoice: ({ utterance, speechSynthesis }) => {
      if (utterance?.voice) return utterance.voice
      return resolvePreferredTtsVoice({
        speechSynthesis,
        userAgent: window.navigator?.userAgent ?? '',
      })
    },
    onSpeakError: (error) => {
      console.warn('[webui] tts speak failed', error)
    },
  })

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

  const stopAll = () => player.stopAll()

  const speakMessages = (messages) => {
    if (!supported || !enabled) return
    const latestText = resolveLatestSpeakText(messages, {
      renderMarkdown,
      documentRef: typeof document === 'undefined' ? null : document,
      DocumentFragmentCtor:
        typeof DocumentFragment === 'undefined' ? null : DocumentFragment,
    })
    if (!latestText) return
    player.speakLatest(latestText)
  }

  const toggle = () => {
    if (!supported) return
    enabled = !enabled
    writeStoredEnabled(enabled)
    if (!enabled) stopAll()
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
