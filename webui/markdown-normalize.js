import { toArtifactUrl } from './artifact-url.js'

const normalizeOrderedListLine = (line) => {
  const flattenedBulletParen = line.replace(
    /^(\s{0,3})[-*+]\s+(\d+)\)\s*/,
    '$1$2. ',
  )
  const flattenedBulletDotSpaced = flattenedBulletParen.replace(
    /^(\s{0,3})[-*+]\s+(\d+)\.\s+/,
    '$1$2. ',
  )
  const flattenedBullet = flattenedBulletDotSpaced.replace(
    /^(\s{0,3})[-*+]\s+(\d+)\.(?=[^\s\d])/,
    '$1$2. ',
  )
  const normalizedParen = flattenedBullet.replace(/^(\s{0,3}\d+)\)\s*/, '$1. ')
  return normalizedParen.replace(/^(\s{0,3}\d+)\.(?=[^\s\d])/, '$1. ')
}

const PATH_TOKEN = /(^|[\s:：\[(（【])((?:file:\/\/\S+|(?:\/|[a-zA-Z]:[\\/]|\.mimikit(?:\/|\\)|[a-zA-Z0-9._-]+[\\/])\S+))(?=$|[\s,，.。;；!！?？)\]）】>》])/g
const TRAILING_PATH_PUNCTUATION = /[.,，。;；!！?？)\]）】>》]+$/
const INLINE_CODE_SEGMENT = /(`[^`\n]*`)/g

const splitTrailingPunctuation = (value) => {
  const match = TRAILING_PATH_PUNCTUATION.exec(value)
  if (!match) return { path: value, trailing: '' }
  return {
    path: value.slice(0, -match[0].length),
    trailing: match[0],
  }
}

const linkifyPathSegment = (segment) =>
  segment.replace(PATH_TOKEN, (full, prefix, token, offset, source) => {
    const normalizedPrefix = prefix ?? ''
    const rawToken = token ?? ''
    if (!rawToken) return full
    if (
      normalizedPrefix === '(' &&
      offset > 0 &&
      source.slice(offset - 1, offset) === ']'
    )
      return full
    const { path, trailing } = splitTrailingPunctuation(rawToken)
    const href = toArtifactUrl(path)
    if (!href) return full
    return `${normalizedPrefix}[${path}](${href})${trailing}`
  })

const linkifyPathLine = (line) => {
  const segments = line.split(INLINE_CODE_SEGMENT)
  if (segments.length === 1) return linkifyPathSegment(line)
  let changed = false
  const next = segments.map((segment, index) => {
    if (index % 2 === 1) return segment
    const linked = linkifyPathSegment(segment)
    if (linked !== segment) changed = true
    return linked
  })
  return changed ? next.join('') : line
}

const isFenceLine = (line) => /^(\s{0,3})(```|~~~)/.test(line)

export const normalizeMarkdownForRender = (text) => {
  const source = typeof text === 'string' ? text : ''
  if (!source) return ''
  const lines = source.split(/\r?\n/)
  let changed = false
  let inFence = false
  const normalized = lines.map((line) => {
    let next = normalizeOrderedListLine(line)
    if (!inFence) next = linkifyPathLine(next)
    if (next !== line) changed = true
    if (isFenceLine(line)) inFence = !inFence
    return next
  })
  return changed ? normalized.join('\n') : source
}
