import { normalizeInlineWhitespace } from './text.js'

const WORD_TOKEN_RE = /\p{L}[\p{L}\p{N}_-]*/gu
const CJK_CHAR_RE = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u
const CJK_GRAM_CHAR_RE =
  /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/gu
const SEARCH_PUNCTUATION_RE = /[，。：；！？（）【】「」『』《》、“”‘’]/gu

const CJK_NGRAM_MIN = 2
const CJK_NGRAM_MAX = 3
const CJK_NGRAM_LIMIT = 384

const SEARCH_PUNCTUATION_MAP: Record<string, string> = {
  '，': ',',
  '。': '.',
  '：': ':',
  '；': ';',
  '！': '!',
  '？': '?',
  '（': '(',
  '）': ')',
  '【': '[',
  '】': ']',
  '「': '"',
  '」': '"',
  '『': '"',
  '』': '"',
  '《': '<',
  '》': '>',
  '、': ',',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
}

const toUnique = (values: string[]): string[] => [...new Set(values)]

const containsCjk = (text: string): boolean => CJK_CHAR_RE.test(text)

export const normalizeSearchText = (text: string): string =>
  normalizeInlineWhitespace(
    text
      .normalize('NFKC')
      .replace(
        SEARCH_PUNCTUATION_RE,
        (char) => SEARCH_PUNCTUATION_MAP[char] ?? char,
      )
      .toLowerCase(),
  )

const tokenizeNormalizedSearchText = (normalized: string): string[] =>
  toUnique([...tokenizeWords(normalized), ...tokenizeCjkNgrams(normalized)])

const tokenizeWords = (text: string): string[] =>
  (text.match(WORD_TOKEN_RE) ?? []).map((token) => token.trim())

const tokenizeCjkNgrams = (text: string): string[] => {
  if (!containsCjk(text)) return []
  const compact = (text.match(CJK_GRAM_CHAR_RE) ?? []).join('')
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
  tokenizeNormalizedSearchText(normalizeSearchText(text))

export const tokenizeSearchTextWithCjkFallback = (text: string): string[] => {
  const normalized = normalizeSearchText(text)
  const base = tokenizeNormalizedSearchText(normalized)
  if (!containsCjk(normalized)) return base
  const compact = (normalized.match(CJK_GRAM_CHAR_RE) ?? []).join('')
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
