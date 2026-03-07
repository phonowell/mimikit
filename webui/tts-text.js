export const MAX_SPEAK_CHARS = 2000

const ENTITY_PATTERN = /&(amp|lt|gt|quot|apos|nbsp);/gi
const CODE_BLOCK_PATTERN = /```(?:[^\n]*\n)?([\s\S]*?)```/g
const INLINE_CODE_PATTERN = /`([^`]+)`/g
const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g
const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g
const EMPHASIS_PATTERN = /(\*\*|__|\*|_|~~)/g

const decodeEntities = (value) =>
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

const normalizeSpeakText = (value) => value.replace(/\s+/g, ' ').trim()

const stripMarkdownSyntax = (value) => {
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
  const flattenedTable = withoutListBullets.replace(/\|/g, ' ')
  const withoutEmphasis = flattenedTable.replace(EMPHASIS_PATTERN, '')
  return decodeEntities(withoutEmphasis)
}

export const fallbackMarkdownToSpeakText = (value) =>
  normalizeSpeakText(stripMarkdownSyntax(value))

const resolveRenderedText = (value, deps) => {
  const renderMarkdown = deps?.renderMarkdown
  const documentRef = deps?.documentRef
  const DocumentFragmentCtor = deps?.DocumentFragmentCtor
  if (typeof renderMarkdown !== 'function') return ''
  if (!documentRef || typeof documentRef.createElement !== 'function') return ''
  if (typeof DocumentFragmentCtor !== 'function') return ''

  try {
    const rendered = renderMarkdown(value)
    if (!(rendered instanceof DocumentFragmentCtor)) return ''
    const container = documentRef.createElement('div')
    container.appendChild(rendered.cloneNode(true))
    return normalizeSpeakText(container.textContent ?? '')
  } catch (error) {
    console.warn('[webui] tts markdown normalize failed', error)
    return ''
  }
}

export const toSpeakText = (value, deps = {}) => {
  const renderedText = resolveRenderedText(value, deps)
  const normalized = renderedText || fallbackMarkdownToSpeakText(value)
  if (!normalized) return ''
  if (normalized.length <= MAX_SPEAK_CHARS) return normalized
  return `${normalized.slice(0, MAX_SPEAK_CHARS)}...`
}

export const resolveLatestSpeakText = (messages, deps = {}) => {
  const items = Array.isArray(messages) ? messages : []
  let latestText = ''
  for (const message of items) {
    const text = toSpeakText(message?.text, deps)
    if (!text) continue
    latestText = text
  }
  return latestText
}
