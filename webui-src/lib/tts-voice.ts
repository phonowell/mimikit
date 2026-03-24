const EDGE_USER_AGENT_PATTERN = /\bedg\//i

type TtsVoiceResolverOptions = {
  speechSynthesis?: Pick<SpeechSynthesis, 'getVoices'> | null
  userAgent?: string
}

const normalizeLower = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

const normalizeLang = (value: unknown): string =>
  normalizeLower(value).replace(/_/g, '-')
const isZhCnVoice = (voice: SpeechSynthesisVoice): boolean =>
  normalizeLang(voice.lang).startsWith('zh-cn')
const isZhVoice = (voice: SpeechSynthesisVoice): boolean =>
  normalizeLang(voice.lang).startsWith('zh-')

const includesKeyword = (
  voice: SpeechSynthesisVoice,
  keyword: string,
): boolean => {
  const lowerKeyword = normalizeLower(keyword)
  if (!lowerKeyword) return false
  const name = normalizeLower(voice.name)
  const voiceUri = normalizeLower(voice.voiceURI)
  return name.includes(lowerKeyword) || voiceUri.includes(lowerKeyword)
}

const FEMALE_KEYWORDS = ['female', 'woman', 'girl', '女', 'xiaoyi', 'xiaoxiao']
const isLikelyFemaleVoice = (voice: SpeechSynthesisVoice): boolean =>
  FEMALE_KEYWORDS.some((keyword) => includesKeyword(voice, keyword))

const chooseFirstMatch = (
  voices: SpeechSynthesisVoice[],
  matcher: (voice: SpeechSynthesisVoice) => boolean,
): SpeechSynthesisVoice | null => {
  const matched = voices.filter((voice) => matcher(voice))
  if (matched.length === 0) return null
  return matched.find((voice) => voice.default === true) ?? matched[0] ?? null
}

export const resolvePreferredTtsVoice = ({
  speechSynthesis,
  userAgent,
}: TtsVoiceResolverOptions = {}): SpeechSynthesisVoice | null => {
  if (
    !EDGE_USER_AGENT_PATTERN.test(
      typeof userAgent === 'string' ? userAgent : '',
    )
  )
    return null
  if (!speechSynthesis || typeof speechSynthesis.getVoices !== 'function')
    return null

  const voices = speechSynthesis.getVoices()
  if (!Array.isArray(voices) || voices.length === 0) return null

  const xiaoxiaoNatural = chooseFirstMatch(
    voices,
    (voice) =>
      isZhCnVoice(voice) &&
      includesKeyword(voice, 'microsoft xiaoxiao online (natural)'),
  )
  if (xiaoxiaoNatural) return xiaoxiaoNatural

  const xiaoxiao = chooseFirstMatch(
    voices,
    (voice) =>
      isZhCnVoice(voice) &&
      (includesKeyword(voice, 'zh-cn-xiaoxiao') ||
        includesKeyword(voice, 'xiaoxiao')),
  )
  if (xiaoxiao) return xiaoxiao

  const zhCnFemale = chooseFirstMatch(
    voices,
    (voice) => isZhCnVoice(voice) && isLikelyFemaleVoice(voice),
  )
  if (zhCnFemale) return zhCnFemale

  const zhCnDefault = chooseFirstMatch(
    voices,
    (voice) => isZhCnVoice(voice) && voice.default === true,
  )
  if (zhCnDefault) return zhCnDefault

  const zhCnAny = chooseFirstMatch(voices, (voice) => isZhCnVoice(voice))
  if (zhCnAny) return zhCnAny

  const zhFemale = chooseFirstMatch(
    voices,
    (voice) => isZhVoice(voice) && isLikelyFemaleVoice(voice),
  )
  if (zhFemale) return zhFemale

  return chooseFirstMatch(
    voices,
    (voice) => isZhVoice(voice) && voice.default === true,
  )
}
