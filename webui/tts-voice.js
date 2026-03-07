const EDGE_USER_AGENT_PATTERN = /\bedg\//i

const normalizeLower = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

const normalizeLang = (value) => normalizeLower(value).replace(/_/g, '-')

const isZhCnVoice = (voice) => {
  const lang = normalizeLang(voice?.lang)
  return lang.startsWith('zh-cn')
}

const isZhVoice = (voice) => normalizeLang(voice?.lang).startsWith('zh-')

const includesKeyword = (voice, keyword) => {
  const lowerKeyword = normalizeLower(keyword)
  if (!lowerKeyword) return false
  const name = normalizeLower(voice?.name)
  const voiceUri = normalizeLower(voice?.voiceURI)
  return name.includes(lowerKeyword) || voiceUri.includes(lowerKeyword)
}

const FEMALE_KEYWORDS = ['female', 'woman', 'girl', '女', 'xiaoyi', 'xiaoxiao']

const isLikelyFemaleVoice = (voice) =>
  FEMALE_KEYWORDS.some((keyword) => includesKeyword(voice, keyword))

const chooseFirstMatch = (voices, matcher) => {
  const matched = voices.filter((voice) => matcher(voice))
  if (matched.length === 0) return null
  const defaultVoice = matched.find((voice) => voice?.default === true)
  return defaultVoice ?? matched[0]
}

export const isEdgeBrowser = (userAgent) =>
  EDGE_USER_AGENT_PATTERN.test(typeof userAgent === 'string' ? userAgent : '')

export const resolvePreferredTtsVoice = ({ speechSynthesis, userAgent } = {}) => {
  if (!isEdgeBrowser(userAgent)) return null
  if (
    !speechSynthesis ||
    typeof speechSynthesis.getVoices !== 'function'
  )
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
    (voice) => isZhCnVoice(voice) && voice?.default === true,
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
    (voice) => isZhVoice(voice) && voice?.default === true,
  )
}
