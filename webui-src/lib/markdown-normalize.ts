import {
  INLINE_CODE_SEGMENT,
  PATH_TOKEN,
  isMarkdownLinkDestination,
  splitTrailingPunctuation,
  toArtifactUrl,
} from '../../src/surface/shared/artifact-link.js'

const normalizeOrderedListLine = (line: string): string => {
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

const normalizeSkipLocalPath = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return splitTrailingPunctuation(trimmed).path
}

const buildSkipLocalPathSet = (
  value: readonly string[] | undefined,
): Set<string> | null => {
  if (!value || value.length === 0) return null
  const next = new Set<string>()
  for (const item of value) {
    const normalized = normalizeSkipLocalPath(item)
    if (normalized) next.add(normalized)
  }
  return next.size > 0 ? next : null
}

const linkifyPathSegment = (
  segment: string,
  skipLocalPaths: ReadonlySet<string> | null,
): string =>
  segment.replace(PATH_TOKEN, (full, prefix, token, offset, source) => {
    const normalizedPrefix = prefix ?? ''
    const rawToken = token ?? ''
    if (!rawToken) return full
    if (isMarkdownLinkDestination(source, offset, normalizedPrefix.length))
      return full
    const { path, trailing } = splitTrailingPunctuation(rawToken)
    if (skipLocalPaths?.has(path)) return full
    const href = toArtifactUrl(path)
    if (!href) return full
    return `${normalizedPrefix}[${path}](${href})${trailing}`
  })

const linkifyPathLine = (
  line: string,
  skipLocalPaths: ReadonlySet<string> | null,
): string => {
  const segments = line.split(INLINE_CODE_SEGMENT)
  if (segments.length === 1) return linkifyPathSegment(line, skipLocalPaths)
  let changed = false
  const next = segments.map((segment, index) => {
    if (index % 2 === 1) return segment
    const linked = linkifyPathSegment(segment, skipLocalPaths)
    if (linked !== segment) changed = true
    return linked
  })
  return changed ? next.join('') : line
}

const isFenceLine = (line: string): boolean => /^(\s{0,3})(```|~~~)/.test(line)

export const normalizeMarkdownForRender = (
  text: unknown,
  options?: {
    skipLocalPaths?: readonly string[]
  },
): string => {
  const source = typeof text === 'string' ? text : ''
  if (!source) return ''
  const skipLocalPaths = buildSkipLocalPathSet(options?.skipLocalPaths)
  const lines = source.split(/\r?\n/)
  let changed = false
  let inFence = false
  const normalized = lines.map((line) => {
    let next = normalizeOrderedListLine(line)
    if (!inFence) next = linkifyPathLine(next, skipLocalPaths)
    if (next !== line) changed = true
    if (isFenceLine(line)) inFence = !inFence
    return next
  })
  return changed ? normalized.join('\n') : source
}
