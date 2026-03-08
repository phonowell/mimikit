import { expect, test } from 'vitest'

import { isEdgeBrowser, resolvePreferredTtsVoice } from '../webui/tts-voice.js'

const createVoice = (overrides: Record<string, unknown> = {}) => ({
  default: false,
  lang: 'zh-CN',
  name: 'Voice',
  voiceURI: 'voice-uri',
  ...overrides,
})

const createSpeechSynthesis = (voices: unknown[]) => ({
  getVoices: () => voices,
})

test('isEdgeBrowser detects Microsoft Edge UA', () => {
  expect(
    isEdgeBrowser(
      'Mozilla/5.0 AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
    ),
  ).toBe(true)
  expect(
    isEdgeBrowser(
      'Mozilla/5.0 AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
    ),
  ).toBe(false)
})

test('resolvePreferredTtsVoice prefers Microsoft Xiaoxiao Online (Natural) on Edge', () => {
  const xiaoxiaoNatural = createVoice({
    name: 'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',
    voiceURI: 'Microsoft Xiaoxiao Online (Natural)',
  })
  const zhDefault = createVoice({ name: 'Microsoft Yunxi', default: true })

  const voice = resolvePreferredTtsVoice({
    speechSynthesis: createSpeechSynthesis([zhDefault, xiaoxiaoNatural]),
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  })

  expect(voice).toBe(xiaoxiaoNatural)
})

test('resolvePreferredTtsVoice falls back to default zh-CN voice when preferred variants are absent', () => {
  const zhDefault = createVoice({
    name: 'zh default',
    voiceURI: 'zh-default',
    default: true,
  })
  const zhAlt = createVoice({
    name: 'zh alt',
    voiceURI: 'zh-alt',
    default: false,
  })
  const voice = resolvePreferredTtsVoice({
    speechSynthesis: createSpeechSynthesis([zhAlt, zhDefault]),
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  })

  expect(voice).toBe(zhDefault)
})

test('resolvePreferredTtsVoice falls back to zh default when only zh voices are available', () => {
  const zhTwDefault = createVoice({
    lang: 'zh-TW',
    name: 'zh tw default',
    voiceURI: 'zh-tw-default',
    default: true,
  })
  const zhTwAlt = createVoice({
    lang: 'zh-TW',
    name: 'zh tw alt',
    voiceURI: 'zh-tw-alt',
    default: false,
  })
  const voice = resolvePreferredTtsVoice({
    speechSynthesis: createSpeechSynthesis([zhTwAlt, zhTwDefault]),
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  })

  expect(voice).toBe(zhTwDefault)
})

test('resolvePreferredTtsVoice returns null for non-Edge browser', () => {
  const voice = resolvePreferredTtsVoice({
    speechSynthesis: createSpeechSynthesis([createVoice()]),
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
  })

  expect(voice).toBeNull()
})
