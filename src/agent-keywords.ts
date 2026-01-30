import { MAX_KEYWORDS } from './agent-constants.js'
import { LATIN_STOPWORDS } from './stopwords.js'

const TOKEN_PATTERN = /[a-z0-9_]{2,}|[\u4e00-\u9fff]{2,}/gi

export const isLatinToken = (token: string): boolean => /[a-z0-9_]/i.test(token)

type TokenStat = {
  count: number
  firstIndex: number
  length: number
  kind: 'latin' | 'cjk'
}

export const extractKeywords = (inputs: { text: string }[]): string[] => {
  const text = inputs.map((i) => i.text).join(' ')
  if (!text) return []
  const stats = new Map<string, TokenStat>()
  let index = 0

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const raw = match[0]
    const position = index
    index += 1
    const latin = isLatinToken(raw)
    const token = latin ? raw.toLowerCase() : raw

    if (latin) {
      if (LATIN_STOPWORDS.has(token)) continue
      if (/^_+$/.test(token)) continue
      if (/^\d+$/.test(token) && token.length < 4) continue
    }

    const existing = stats.get(token)
    if (existing) {
      existing.count += 1
      continue
    }

    stats.set(token, {
      count: 1,
      firstIndex: position,
      length: token.length,
      kind: latin ? 'latin' : 'cjk',
    })
  }

  if (stats.size === 0) return []

  const scored: Array<{
    token: string
    score: number
    length: number
    index: number
  }> = []

  for (const [token, stat] of stats) {
    if (stat.length <= 2 && stat.count < 2) continue

    let score = stat.count
    if (stat.kind === 'latin') {
      if (stat.length >= 6) score += 1
      if (stat.length >= 10) score += 1
      if (token.includes('_')) score += 1
      if (/^\d+$/.test(token)) score -= 1
    } else score += Math.max(0, stat.length - 2)

    scored.push({
      token,
      score,
      length: stat.length,
      index: stat.firstIndex,
    })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.length !== a.length) return b.length - a.length
    return a.index - b.index
  })

  return scored.slice(0, MAX_KEYWORDS).map((item) => item.token)
}
