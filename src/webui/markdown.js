import { marked } from './vendor/marked.js'
import createDOMPurify from './vendor/purify.js'

const purify = createDOMPurify(window)
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

marked.setOptions({
  gfm: true,
  breaks: true,
  headerIds: false,
  mangle: false,
})

const isSafeHref = (value) => {
  const raw = value?.trim() ?? ''
  if (!raw) return false
  try {
    const url = new URL(raw, window.location.origin)
    if (url.protocol === 'mailto:') return true
    return SAFE_PROTOCOLS.has(url.protocol)
  } catch {
    return false
  }
}

const isSafeSrc = (value) => {
  const raw = value?.trim() ?? ''
  if (!raw) return false
  try {
    const url = new URL(raw, window.location.origin)
    return SAFE_PROTOCOLS.has(url.protocol)
  } catch {
    return false
  }
}

purify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const href = node.getAttribute('href')
    if (href && isSafeHref(href)) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    } else {
      node.removeAttribute('href')
    }
  }

  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src')
    if (!src || !isSafeSrc(src)) {
      node.removeAttribute('src')
    }
  }

  if (node.tagName === 'INPUT') {
    const type = node.getAttribute('type')
    if (type !== 'checkbox') {
      node.parentNode?.removeChild(node)
      return
    }
    node.setAttribute('disabled', '')
  }
})

export const renderMarkdown = (text) => {
  const source = typeof text === 'string' ? text : ''
  if (!source.trim()) return document.createDocumentFragment()
  const html = marked.parse(source)
  const clean = purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['iframe', 'script', 'style'],
  })
  const template = document.createElement('template')
  template.innerHTML = clean
  return template.content
}
