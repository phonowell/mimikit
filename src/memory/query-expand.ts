const LATIN_TOKEN = /[a-z0-9]/i
const CJK_TOKEN = /[\u4e00-\u9fff]/

const uniquePush = (items: string[], value: string) => {
  if (!value) return
  if (items.includes(value)) return
  items.push(value)
}

const expandLatin = (token: string, out: string[]) => {
  const lower = token.toLowerCase()
  uniquePush(out, lower)
  if (lower.includes('_')) uniquePush(out, lower.replaceAll('_', '-'))
  if (lower.includes('-')) uniquePush(out, lower.replaceAll('-', '_'))
  if (lower.includes('-') || lower.includes('_'))
    uniquePush(out, lower.replace(/[-_]/g, ''))

  const camelParts = token.match(/[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])/g) ?? []
  if (camelParts.length > 1) {
    for (const part of camelParts) {
      const trimmed = part.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (trimmed.length >= 3) uniquePush(out, trimmed)
    }
  }
}

const expandCjk = (token: string, out: string[]) => {
  uniquePush(out, token)
  if (token.length <= 2) return
  for (let i = 0; i < token.length - 1; i += 1)
    uniquePush(out, token.slice(i, i + 2))
}

export const expandKeywords = (
  keywords: string[],
  options?: { maxTerms?: number | undefined },
): string[] => {
  const maxTerms = options?.maxTerms ?? 12
  const expanded: string[] = []
  for (const raw of keywords) {
    const token = raw.trim()
    if (!token) continue
    if (LATIN_TOKEN.test(token)) expandLatin(token, expanded)
    else if (CJK_TOKEN.test(token)) expandCjk(token, expanded)
    if (expanded.length >= maxTerms) break
  }
  return expanded.slice(0, maxTerms)
}
