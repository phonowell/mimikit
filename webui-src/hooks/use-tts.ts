import { useEffect, useState } from 'react'

import { createTtsPlayer } from '../../webui/tts-player.js'
import { resolveLatestSpeakText } from '../../webui/tts-text.js'
import { resolvePreferredTtsVoice } from '../../webui/tts-voice.js'

import type { ChatMessage } from '../types.js'

const TTS_STORAGE_KEY = 'mimikit-webui-tts-enabled'

type VoiceResolverParams = {
  utterance: SpeechSynthesisUtterance
  speechSynthesis: SpeechSynthesis
}

const isSpeechSupported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.speechSynthesis !== 'undefined' &&
  typeof window.SpeechSynthesisUtterance !== 'undefined'

const readStoredEnabled = (): boolean => {
  try {
    return window.localStorage.getItem(TTS_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const useTts = (): {
  enabled: boolean
  supported: boolean
  setEnabled: (enabled: boolean) => void
  speakMessages: (messages: ChatMessage[]) => void
} => {
  const supported = isSpeechSupported()
  const [enabled, setEnabledState] = useState<boolean>(
    () => supported && readStoredEnabled(),
  )

  useEffect(() => {
    if (!supported) return
    try {
      window.localStorage.setItem(TTS_STORAGE_KEY, enabled ? '1' : '0')
    } catch {}
  }, [enabled, supported])

  const player = createTtsPlayer({
    speechSynthesis: supported ? window.speechSynthesis : undefined,
    SpeechSynthesisUtterance: supported
      ? window.SpeechSynthesisUtterance
      : undefined,
    resolveVoice: ({ utterance, speechSynthesis }: VoiceResolverParams) =>
      utterance?.voice ||
      resolvePreferredTtsVoice({
        speechSynthesis,
        userAgent: window.navigator?.userAgent ?? '',
      }),
  })

  return {
    enabled,
    supported,
    setEnabled: setEnabledState,
    speakMessages: (messages) => {
      if (!supported || !enabled) return
      const text = resolveLatestSpeakText(messages)
      if (text) player.speakLatest(text)
    },
  }
}
