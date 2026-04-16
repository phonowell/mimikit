import createDOMPurify from 'dompurify'
import { marked } from 'marked'

import { linkifyInlineCode, toArtifactUrl } from './artifact-url.js'
import { normalizeMarkdownForRender } from './markdown-normalize.js'

const ALLOWED_TAGS = [
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'input',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]
const ALLOWED_ATTR = [
  'align',
  'alt',
  'checked',
  'class',
  'disabled',
  'href',
  'rel',
  'src',
  'target',
  'title',
  'type',
]
const SAFE_PROTOCOLS = new Set(['http:', 'https:'])
const MARKDOWN_CACHE_LIMIT = 128

const markdownCache = new Map<string, string>()
let purifyInstance: ReturnType<typeof createDOMPurify> | null = null

marked.setOptions({ gfm: true, breaks: true })

const isSafeProtocol = (value: string, allowMailto: boolean): boolean => {
  try {
    const protocol = new URL(value, window.location.origin).protocol
    if (allowMailto && protocol === 'mailto:') return true
    return SAFE_PROTOCOLS.has(protocol)
  } catch {
    return false
  }
}

const trimMarkdownCache = (): void => {
  if (markdownCache.size < MARKDOWN_CACHE_LIMIT) return
  const oldestKey = markdownCache.keys().next().value
  if (typeof oldestKey === 'string') markdownCache.delete(oldestKey)
}

const getPurify = () => {
  if (purifyInstance) return purifyInstance
  const purify = createDOMPurify(window)
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href')
      const rewritten = href ? toArtifactUrl(href) : null
      if (rewritten) node.setAttribute('href', rewritten)
      const finalHref = node.getAttribute('href')
      if (finalHref && isSafeProtocol(finalHref, true)) {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      } else node.removeAttribute('href')
    }
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src')
      const rewritten = src ? toArtifactUrl(src) : null
      if (rewritten) node.setAttribute('src', rewritten)
      const finalSrc = node.getAttribute('src')
      if (!finalSrc || !isSafeProtocol(finalSrc, false))
        node.removeAttribute('src')
    }
    if (node.tagName === 'INPUT' && node.getAttribute('type') !== 'checkbox')
      node.parentNode?.removeChild(node)
  })
  purifyInstance = purify
  return purify
}

export const renderMarkdownHtml = (
  text: string,
  options?: {
    linkifyLocalPaths?: boolean
  },
): string => {
  const source =
    options?.linkifyLocalPaths === false
      ? text
      : normalizeMarkdownForRender(text)
  if (!source.trim()) return ''
  const cached = markdownCache.get(source)
  if (cached) return cached
  const rendered = marked.parse(source) as string
  const clean = getPurify().sanitize(rendered, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['iframe', 'script', 'style'],
  })
  const template = document.createElement('template')
  template.innerHTML = clean
  linkifyInlineCode(template.content)
  const html = template.innerHTML
  trimMarkdownCache()
  markdownCache.set(source, html)
  return html
}
