import { marked } from './vendor/marked/marked.esm.js'
import createDOMPurify from './vendor/purify/purify.es.mjs'

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
const ARTIFACT_PREFIX = '/artifacts/'

const splitPathSuffix = (value) => {
  const match = /^([^?#]*)([?#].*)?$/.exec(value)
  return {
    path: match?.[1] ?? value,
    suffix: match?.[2] ?? '',
  }
}

const hasScheme = (value) => /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)
const isWindowsDrivePath = (value) => /^[a-zA-Z]:[\\/]/.test(value)

const extractGeneratedRelative = (value) => {
  let raw = value.trim()
  if (!raw) return null
  raw = raw.replace(/\\/g, '/')
  if (raw.startsWith('./')) raw = raw.slice(2)
  if (raw.startsWith('generated/')) return raw.slice('generated/'.length)
  if (raw.startsWith('.mimikit/generated/'))
    return raw.slice('.mimikit/generated/'.length)
  const mimikitIndex = raw.indexOf('/.mimikit/generated/')
  if (mimikitIndex >= 0)
    return raw.slice(mimikitIndex + '/.mimikit/generated/'.length)
  const generatedIndex = raw.indexOf('/generated/')
  if (generatedIndex >= 0)
    return raw.slice(generatedIndex + '/generated/'.length)
  return null
}

const normalizeRelativePath = (value) => {
  const parts = value.split('/').filter((part) => part.length > 0)
  if (parts.length === 0) return null
  for (const part of parts) {
    if (part === '.' || part === '..') return null
  }
  return parts.join('/')
}

const encodeRelativePath = (value) =>
  value
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')

const toArtifactUrl = (value) => {
  const raw = value?.trim()
  if (!raw) return null
  if (raw.startsWith('#')) return null
  if (raw.startsWith(ARTIFACT_PREFIX)) return null
  if (hasScheme(raw) && !raw.startsWith('file:') && !isWindowsDrivePath(raw))
    return null
  let path = ''
  let suffix = ''
  if (raw.startsWith('file:')) {
    try {
      const url = new URL(raw)
      path = url.pathname
      suffix = `${url.search}${url.hash}`
    } catch (error) {
      return null
    }
  } else {
    const split = splitPathSuffix(raw)
    path = split.path
    suffix = split.suffix
  }
  const relative = extractGeneratedRelative(path)
  if (!relative) return null
  const normalized = normalizeRelativePath(relative)
  if (!normalized) return null
  const encoded = encodeRelativePath(normalized)
  return `${ARTIFACT_PREFIX}${encoded}${suffix}`
}

const linkifyInlineCode = (fragment) => {
  const codes = fragment.querySelectorAll('code')
  for (const code of codes) {
    if (code.closest('pre') || code.closest('a')) continue
    if (code.childElementCount > 0) continue
    const raw = code.textContent ?? ''
    const text = raw.trim()
    if (!text || text !== raw) continue
    const rewritten = toArtifactUrl(text)
    if (!rewritten) continue
    const link = document.createElement('a')
    link.setAttribute('href', rewritten)
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
    link.appendChild(code.cloneNode(true))
    code.replaceWith(link)
  }
}

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
  } catch (error) {
    console.warn('[webui] isSafeHref failed', error)
    return false
  }
}

const isSafeSrc = (value) => {
  const raw = value?.trim() ?? ''
  if (!raw) return false
  try {
    const url = new URL(raw, window.location.origin)
    return SAFE_PROTOCOLS.has(url.protocol)
  } catch (error) {
    console.warn('[webui] isSafeSrc failed', error)
    return false
  }
}

purify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const href = node.getAttribute('href')
    const rewritten = href ? toArtifactUrl(href) : null
    if (rewritten) node.setAttribute('href', rewritten)
    const finalHref = node.getAttribute('href')
    if (finalHref && isSafeHref(finalHref)) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    } else {
      node.removeAttribute('href')
    }
  }

  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src')
    const rewritten = src ? toArtifactUrl(src) : null
    if (rewritten) node.setAttribute('src', rewritten)
    const finalSrc = node.getAttribute('src')
    if (!finalSrc || !isSafeSrc(finalSrc)) {
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
  linkifyInlineCode(template.content)
  return template.content
}
