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

export const toArtifactUrl = (value) => {
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

export const linkifyInlineCode = (fragment) => {
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
