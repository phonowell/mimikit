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

test('resolvePreferredTtsVoice falls back to zh-CN female-like voice when Xiaoxiao missing', () => {
  const female = createVoice({
    name: 'Microsoft Xiaoyi',
    voiceURI: 'zh-CN-XiaoyiNeural',
  })
  const male = createVoice({
    name: 'Microsoft Yunxi',
    voiceURI: 'zh-CN-YunxiNeural',
    default: true,
  })

  const voice = resolvePreferredTtsVoice({
    speechSynthesis: createSpeechSynthesis([male, female]),
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  })

  expect(voice).toBe(female)
})

test('resolvePreferredTtsVoice falls back to zh-CN default when no female marker', () => {
  const zhDefault = createVoice({
    name: 'Microsoft Yunxi',
    voiceURI: 'zh-CN-YunxiNeural',
    default: true,
  })
  const zhOther = createVoice({
    name: 'Microsoft Standard',
    voiceURI: 'zh-CN-Standard',
  })

  const voice = resolvePreferredTtsVoice({
    speechSynthesis: createSpeechSynthesis([zhOther, zhDefault]),
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  })

  expect(voice).toBe(zhDefault)
})

test('resolvePreferredTtsVoice returns null for non-Edge browser', () => {
  const voice = resolvePreferredTtsVoice({
    speechSynthesis: createSpeechSynthesis([createVoice()]),
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
  })

  expect(voice).toBeNull()
})
