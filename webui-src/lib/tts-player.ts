type ResolveVoiceParams = {
  text: string
  utterance: SpeechSynthesisUtterance
  speechSynthesis: SpeechSynthesis
}

type VoiceResolver = (
  params: ResolveVoiceParams,
) => SpeechSynthesisVoice | null | undefined

type TtsPlayerOptions = {
  speechSynthesis?: SpeechSynthesis | undefined
  SpeechSynthesisUtterance?:
    | typeof globalThis.SpeechSynthesisUtterance
    | undefined
  onSpeakError?: ((error: unknown) => void) | undefined
  resolveVoice?: VoiceResolver | undefined
}

type SpeakOptions = {
  voice?: SpeechSynthesisVoice | null
}

type TtsPlayer = {
  speakLatest: (text: string, options?: SpeakOptions) => void
  stopAll: () => void
  isSpeaking: () => boolean
  getCurrentUtterance?: () => SpeechSynthesisUtterance | null
}

export const createTtsPlayer = (options: TtsPlayerOptions = {}): TtsPlayer => {
  const {
    speechSynthesis,
    SpeechSynthesisUtterance,
    onSpeakError,
    resolveVoice,
  } = options
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
  let currentUtterance: SpeechSynthesisUtterance | null = null
  let speakSessionId = 0

  const finishSession = (sessionId: number): void => {
    if (sessionId !== speakSessionId) return
    speaking = false
    currentUtterance = null
  }

  const reportSpeakError = (error: unknown): void => {
    if (typeof onSpeakError === 'function') onSpeakError(error)
  }

  const speakLatest = (text: string, options: SpeakOptions = {}): void => {
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

    utterance.onend = () => finishSession(sessionId)
    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
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
