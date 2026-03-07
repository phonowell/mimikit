export const createTtsPlayer = ({
  speechSynthesis,
  SpeechSynthesisUtterance,
  onSpeakError,
  resolveVoice,
} = {}) => {
  if (
    !speechSynthesis ||
    typeof speechSynthesis.speak !== 'function' ||
    typeof speechSynthesis.cancel !== 'function' ||
    typeof SpeechSynthesisUtterance !== 'function'
  ) {
    return {
      speakLatest: () => {},
      stopAll: () => {},
      isSpeaking: () => false,
    }
  }

  let speaking = false
  let currentUtterance = null
  let speakSessionId = 0

  const finishSession = (sessionId) => {
    if (sessionId !== speakSessionId) return
    speaking = false
    currentUtterance = null
  }

  const reportSpeakError = (error) => {
    if (typeof onSpeakError === 'function') onSpeakError(error)
  }

  const speakLatest = (text, options = {}) => {
    if (!text) return
    if (speaking || speechSynthesis.speaking) speechSynthesis.cancel()
    speakSessionId += 1
    const sessionId = speakSessionId

    speaking = true
    const utterance = new SpeechSynthesisUtterance(text)
    currentUtterance = utterance
    const explicitVoice =
      options && typeof options === 'object' ? options.voice : null
    if (explicitVoice) utterance.voice = explicitVoice
    if (!utterance.voice) {
      const resolvedVoice =
        typeof resolveVoice === 'function'
          ? resolveVoice({ text, utterance, speechSynthesis })
          : null
      if (resolvedVoice) utterance.voice = resolvedVoice
    }

    utterance.onend = () => {
      finishSession(sessionId)
    }

    utterance.onerror = (event) => {
      if (sessionId !== speakSessionId) return
      reportSpeakError(event?.error ?? 'unknown')
      finishSession(sessionId)
    }

    try {
      speechSynthesis.speak(utterance)
    } catch (error) {
      if (sessionId !== speakSessionId) return
      reportSpeakError(error)
      finishSession(sessionId)
    }
  }

  const stopAll = () => {
    speakSessionId += 1
    speaking = false
    currentUtterance = null
    speechSynthesis.cancel()
  }

  return {
    speakLatest,
    stopAll,
    isSpeaking: () => speaking,
    getCurrentUtterance: () => currentUtterance,
  }
}
