import { expect, test, vi } from 'vitest'

import { createTtsPlayer } from '../webui/tts-player.js'

type TestUtterance = {
  text: string
  voice: unknown
  onend: null | (() => void)
  onerror: null | ((event: { error?: string }) => void)
}

const createUtteranceCtor = () =>
  class {
    text: string
    voice: unknown
    onend: null | (() => void)
    onerror: null | ((event: { error?: string }) => void)

    constructor(text: string) {
      this.text = text
      this.voice = null
      this.onend = null
      this.onerror = null
    }
  }

test('createTtsPlayer interrupts old speech and keeps latest only', () => {
  const spoken: string[] = []
  const utterances: TestUtterance[] = []
  const speechSynthesis = {
    speaking: false,
    cancel: vi.fn(() => {
      speechSynthesis.speaking = false
    }),
    speak: vi.fn((utterance: TestUtterance) => {
      speechSynthesis.speaking = true
      utterances.push(utterance)
      spoken.push(utterance.text)
    }),
  }

  const player = createTtsPlayer({
    speechSynthesis,
    SpeechSynthesisUtterance: createUtteranceCtor(),
  })

  player.speakLatest('first')
  player.speakLatest('second')

  expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1)
  expect(spoken).toEqual(['first', 'second'])
  expect(player.isSpeaking()).toBe(true)

  utterances[0]?.onend?.()
  expect(player.isSpeaking()).toBe(true)

  utterances[1]?.onend?.()
  expect(player.isSpeaking()).toBe(false)
})

test('createTtsPlayer stopAll cancels playback immediately', () => {
  const speechSynthesis = {
    speaking: false,
    cancel: vi.fn(() => {
      speechSynthesis.speaking = false
    }),
    speak: vi.fn(() => {
      speechSynthesis.speaking = true
    }),
  }

  const player = createTtsPlayer({
    speechSynthesis,
    SpeechSynthesisUtterance: createUtteranceCtor(),
  })

  player.speakLatest('hello')
  expect(player.isSpeaking()).toBe(true)

  player.stopAll()
  expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1)
  expect(player.isSpeaking()).toBe(false)
})

test('createTtsPlayer keeps explicit voice over resolver voice', () => {
  const utterances: TestUtterance[] = []
  const preferredVoice = { name: 'preferred' }
  const explicitVoice = { name: 'explicit' }
  const speechSynthesis = {
    speaking: false,
    cancel: vi.fn(() => {
      speechSynthesis.speaking = false
    }),
    speak: vi.fn((utterance: TestUtterance) => {
      speechSynthesis.speaking = true
      utterances.push(utterance)
    }),
  }

  const player = createTtsPlayer({
    speechSynthesis,
    SpeechSynthesisUtterance: createUtteranceCtor(),
    resolveVoice: () => preferredVoice,
  })

  player.speakLatest('hello', { voice: explicitVoice })

  expect(utterances).toHaveLength(1)
  expect(utterances[0]?.voice).toBe(explicitVoice)
})
