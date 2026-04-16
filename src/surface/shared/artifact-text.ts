import { toSurfaceArtifactLink } from './artifact-url.js'

import type { SurfaceArtifactLink } from './artifact-contract.js'

export const PATH_TOKEN =
  /(^|[\s:："'“‘\[(（【「『《〈])((?:file:\/\/\S+|(?:\/|[a-zA-Z]:[\\/]|\.mimikit(?:\/|\\)|[^\s:："'“”‘’/\\\[(（【「」『』《》〈〉<>,，.。;；!！?？)\]）】>]+[\\/])\S+))(?=$|[\s,，.。;；!！?？"'”’)\]）】」』》〉>])/g

const TRAILING_PATH_PUNCTUATION = /[.,，。;；!！?？"'”’)\]）】」』》〉>]+$/
export const INLINE_CODE_SEGMENT = /(`[^`\n]*`)/g

export const splitTrailingPunctuation = (
  value: string,
): { path: string; trailing: string } => {
  const match = TRAILING_PATH_PUNCTUATION.exec(value)
  if (!match) return { path: value, trailing: '' }
  return { path: value.slice(0, -match[0].length), trailing: match[0] }
}

export const isMarkdownLinkDestination = (
  source: string,
  prefixOffset: number,
  prefixLength: number,
): boolean => {
  let cursor = prefixOffset + prefixLength
  while (cursor > 0 && /\s/u.test(source.slice(cursor - 1, cursor))) cursor -= 1
  if (source.slice(cursor - 1, cursor) !== '(') return false
  return source.slice(cursor - 2, cursor - 1) === ']'
}

const isFenceLine = (line: string): boolean => /^(\s{0,3})(```|~~~)/.test(line)

export const normalizeSurfaceArtifacts = (
  value: unknown,
): SurfaceArtifactLink[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const next: SurfaceArtifactLink[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as {
      path?: unknown
      kind?: unknown
      note?: unknown
      label?: unknown
    }
    const artifact = toSurfaceArtifactLink({
      path: typeof raw.path === 'string' ? raw.path : '',
      ...(typeof raw.kind === 'string' ? { kind: raw.kind } : {}),
      ...(typeof raw.note === 'string' ? { note: raw.note } : {}),
      ...(typeof raw.label === 'string' ? { label: raw.label } : {}),
    })
    if (!artifact) continue
    const key = `${artifact.href}::${artifact.label}`
    if (seen.has(key)) continue
    seen.add(key)
    next.push(artifact)
  }
  return next.length > 0 ? next : undefined
}

export const extractArtifactLinksFromText = (
  text: string | null | undefined,
): SurfaceArtifactLink[] | undefined => {
  const source = typeof text === 'string' ? text : ''
  if (!source.trim()) return undefined
  const seen = new Set<string>()
  const found: SurfaceArtifactLink[] = []
  let inFence = false

  const collectFromSegment = (segment: string) => {
    PATH_TOKEN.lastIndex = 0
    segment.replace(PATH_TOKEN, (full, prefix, token, offset, lineSource) => {
      const normalizedPrefix = prefix ?? ''
      const rawToken = token ?? ''
      if (!rawToken) return full
      if (
        isMarkdownLinkDestination(lineSource, offset, normalizedPrefix.length)
      )
        return full
      const { path } = splitTrailingPunctuation(rawToken)
      const artifact = toSurfaceArtifactLink({ path })
      if (!artifact) return full
      const key = `${artifact.href}::${artifact.label}`
      if (!seen.has(key)) {
        seen.add(key)
        found.push(artifact)
      }
      return full
    })
  }

  for (const line of source.split(/\r?\n/)) {
    if (!inFence) {
      const segments = line.split(INLINE_CODE_SEGMENT)
      if (segments.length === 1) collectFromSegment(line)
      else {
        for (const [index, segment] of segments.entries()) {
          if (index % 2 === 1) continue
          collectFromSegment(segment)
        }
      }
    }
    if (isFenceLine(line)) inFence = !inFence
  }

  return found.length > 0 ? found : undefined
}
