import { useEffect, useState } from 'react'

import { createTtsPlayer } from '../lib/tts-player.js'
import { resolveLatestSpeakText } from '../lib/tts-text.js'
import { resolvePreferredTtsVoice } from '../lib/tts-voice.js'

import type { ChatMessage } from '../types.js'

const TTS_STORAGE_KEY = 'mimikit-webui-tts-enabled'
const TTS_STORAGE_VERSION = 'v2'
const VERSIONED_TTS_STORAGE_KEY = `${TTS_STORAGE_KEY}:${TTS_STORAGE_VERSION}`
let speechSupportedSnapshot: boolean | null = null
let storedEnabledSnapshot: boolean | null = null
let sharedPlayer: ReturnType<typeof createTtsPlayer> | null = null

type VoiceResolverParams = {
  utterance: SpeechSynthesisUtterance
  speechSynthesis: SpeechSynthesis
}

const isSpeechSupported = (): boolean => {
  if (speechSupportedSnapshot !== null) return speechSupportedSnapshot
  speechSupportedSnapshot =
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  return speechSupportedSnapshot
}

const readStoredEnabled = (): boolean => {
  if (storedEnabledSnapshot !== null) return storedEnabledSnapshot
  try {
    const stored =
      window.localStorage.getItem(VERSIONED_TTS_STORAGE_KEY) ??
      window.localStorage.getItem(TTS_STORAGE_KEY)
    storedEnabledSnapshot = stored === '1'
    return storedEnabledSnapshot
  } catch {
    storedEnabledSnapshot = false
    return false
  }
}

const getSharedPlayer = (supported: boolean) => {
  if (sharedPlayer) return sharedPlayer
  sharedPlayer = createTtsPlayer({
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
  return sharedPlayer
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
  const player = getSharedPlayer(supported)

  useEffect(() => {
    if (!supported) return
    try {
      storedEnabledSnapshot = enabled
      window.localStorage.setItem(
        VERSIONED_TTS_STORAGE_KEY,
        enabled ? '1' : '0',
      )
      window.localStorage.removeItem(TTS_STORAGE_KEY)
    } catch {}
  }, [enabled, supported])
  useEffect(() => {
    if (enabled) return
    player.stopAll()
  }, [enabled, player])
  useEffect(() => () => player.stopAll(), [player])

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
