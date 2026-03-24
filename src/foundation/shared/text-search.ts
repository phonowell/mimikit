const WORD_TOKEN_RE = /\p{L}[\p{L}\p{N}_-]*/gu
const CJK_CHAR_RE = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u
const CJK_GRAM_CHAR_RE =
  /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/gu

const CJK_NGRAM_MIN = 2
const CJK_NGRAM_MAX = 3
const CJK_NGRAM_LIMIT = 384

const toUnique = (values: string[]): string[] => [...new Set(values)]

const containsCjk = (text: string): boolean => CJK_CHAR_RE.test(text)

const tokenizeWords = (text: string): string[] =>
  (text.toLowerCase().match(WORD_TOKEN_RE) ?? []).map((token) => token.trim())

const tokenizeCjkNgrams = (text: string): string[] => {
  if (!containsCjk(text)) return []
  const compact = (text.toLowerCase().match(CJK_GRAM_CHAR_RE) ?? []).join('')
  if (!compact) return []
  const chars = Array.from(compact)
  if (chars.length < CJK_NGRAM_MIN) return []
  const grams: string[] = []
  for (let size = CJK_NGRAM_MIN; size <= CJK_NGRAM_MAX; size += 1) {
    if (chars.length < size) continue
    for (let index = 0; index <= chars.length - size; index += 1) {
      grams.push(`cjk:${chars.slice(index, index + size).join('')}`)
      if (grams.length >= CJK_NGRAM_LIMIT) return toUnique(grams)
    }
  }
  return toUnique(grams)
}

export const tokenizeSearchText = (text: string): string[] =>
  toUnique([...tokenizeWords(text), ...tokenizeCjkNgrams(text)])

export const tokenizeSearchTextWithCjkFallback = (text: string): string[] => {
  const base = tokenizeSearchText(text)
  if (!containsCjk(text)) return base
  const compact = (text.toLowerCase().match(CJK_GRAM_CHAR_RE) ?? []).join('')
  if (!compact) return base
  const singleChars = Array.from(compact).map((char) => `cjk1:${char}`)
  return toUnique([...base, ...singleChars])
}

export const scoreTokenOverlap = (
  queryTokens: string[],
  haystackTokens: string[],
): number => {
  if (queryTokens.length === 0 || haystackTokens.length === 0) return 0
  const haystackSet = new Set(haystackTokens)
  let hitCount = 0
  for (const token of queryTokens) if (haystackSet.has(token)) hitCount += 1
  return hitCount / queryTokens.length
}

export const scoreTextOverlap = (query: string, haystack: string): number =>
  scoreTokenOverlap(tokenizeSearchText(query), tokenizeSearchText(haystack))
