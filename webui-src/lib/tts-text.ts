import type { ChatMessage } from '../types.js'

export const MAX_SPEAK_CHARS = 2_000

const ENTITY_PATTERN = /&(amp|lt|gt|quot|apos|nbsp);/gi
const CODE_BLOCK_PATTERN = /```(?:[^\n]*\n)?([\s\S]*?)```/g
const INLINE_CODE_PATTERN = /`([^`]+)`/g
const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g
const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g
const EMPHASIS_PATTERN = /(\*\*|__|\*|_|~~)/g

const decodeEntities = (value: string): string =>
  value.replace(ENTITY_PATTERN, (entity, name) => {
    const lower = String(name).toLowerCase()
    if (lower === 'amp') return '&'
    if (lower === 'lt') return '<'
    if (lower === 'gt') return '>'
    if (lower === 'quot') return '"'
    if (lower === 'apos') return "'"
    if (lower === 'nbsp') return ' '
    return entity
  })

const normalizeSpeakText = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

const stripMarkdownSyntax = (value: unknown): string => {
  const source = typeof value === 'string' ? value : ''
  if (!source) return ''
  const keepCodeBlocks = source.replace(CODE_BLOCK_PATTERN, '$1\n')
  const keepInlineCode = keepCodeBlocks.replace(INLINE_CODE_PATTERN, '$1')
  const withImageAlt = keepInlineCode.replace(IMAGE_PATTERN, '$1')
  const withLinkLabel = withImageAlt.replace(LINK_PATTERN, '$1')
  const withoutHeaders = withLinkLabel.replace(/^\s{0,3}#{1,6}\s+/gm, '')
  const withoutQuotes = withoutHeaders.replace(/^\s{0,3}>\s?/gm, '')
  const withoutListBullets = withoutQuotes
    .replace(/^\s{0,3}(?:[-*+])\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
  return decodeEntities(
    withoutListBullets.replace(/\|/g, ' ').replace(EMPHASIS_PATTERN, ''),
  )
}

export const fallbackMarkdownToSpeakText = (value: unknown): string =>
  normalizeSpeakText(stripMarkdownSyntax(value))

export const toSpeakText = (value: unknown): string => {
  const normalized = fallbackMarkdownToSpeakText(value)
  if (!normalized) return ''
  if (normalized.length <= MAX_SPEAK_CHARS) return normalized
  return `${normalized.slice(0, MAX_SPEAK_CHARS)}...`
}

export const resolveLatestSpeakText = (
  messages: ChatMessage[] | null | undefined,
): string => {
  const items = Array.isArray(messages) ? messages : []
  let latestText = ''
  for (const message of items) {
    const text = toSpeakText(message?.text)
    if (!text) continue
    latestText = text
  }
  return latestText
}
