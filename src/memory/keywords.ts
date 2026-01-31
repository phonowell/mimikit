const WORD_RE = /[a-z0-9_]{2,}|[\u4e00-\u9fff]{2,}/gi
const STOP = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'you',
  'your',
])

export const extractKeywords = (texts: string[], limit = 6): string[] => {
  const hits: string[] = []
  for (const text of texts) {
    const words = text.match(WORD_RE) ?? []
    for (const word of words) {
      const w = word.toLowerCase()
      if (STOP.has(w)) continue
      hits.push(w)
      if (hits.length >= limit) return hits
    }
  }
  return hits
}
