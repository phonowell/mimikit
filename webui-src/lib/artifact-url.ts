import {
  buildArchiveViewerUrlFromSource,
  isArchiveMarkdownPath,
} from './archive-viewer-url.js'

const STATE_FILE_PREFIX = '/state-files/'
const WORKSPACE_FILE_ROUTE = '/api/workspace-file'
const SUPPORTED_WORKSPACE_FILE_EXTENSIONS = [
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.markdown',
  '.md',
  '.mjs',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
] as const
const STATE_ROOT_PREFIX = '.mimikit/'
const STATE_ROOT_SEGMENT = '/.mimikit/'
const STATE_TOP_LEVEL_DIRS = new Set([
  'generated',
  'history',
  'inputs',
  'memory',
  'qq',
  'results',
  'task-progress',
  'tasks',
  'traces',
])
const STATE_TOP_LEVEL_FILES = new Set([
  'log.jsonl',
  'runtime-snapshot.json',
  'runtime-snapshot.json.bak',
])

const splitPathSuffix = (value: string): { path: string; suffix: string } => {
  const match = /^([^?#]*)([?#].*)?$/.exec(value)
  return { path: match?.[1] ?? value, suffix: match?.[2] ?? '' }
}

const hasScheme = (value: string): boolean =>
  /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)
const isWindowsDrivePath = (value: string): boolean =>
  /^[a-zA-Z]:[\\/]/.test(value)

const hasKnownStateTopLevel = (value: string): boolean => {
  if (!value) return false
  const slashIndex = value.indexOf('/')
  if (slashIndex < 0) {
    if (STATE_TOP_LEVEL_FILES.has(value)) return true
    return STATE_TOP_LEVEL_DIRS.has(value)
  }
  return STATE_TOP_LEVEL_DIRS.has(value.slice(0, slashIndex))
}

const extractStateRelative = (value: string): string | null => {
  let raw = value.trim()
  if (!raw) return null
  raw = raw.replace(/\\/g, '/')
  if (raw.startsWith('./')) raw = raw.slice(2)
  if (raw.startsWith(STATE_ROOT_PREFIX))
    return raw.slice(STATE_ROOT_PREFIX.length)
  const rootIndex = raw.indexOf(STATE_ROOT_SEGMENT)
  if (rootIndex >= 0) return raw.slice(rootIndex + STATE_ROOT_SEGMENT.length)
  if (hasKnownStateTopLevel(raw)) return raw
  return null
}

const normalizeRelativePath = (value: string): string | null => {
  const parts = value.split('/').filter((part) => part.length > 0)
  if (parts.length === 0) return null
  for (const part of parts) if (part === '.' || part === '..') return null
  return parts.join('/')
}

const encodeRelativePath = (value: string): string =>
  value
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')

const isMarkdownPath = (value: string): boolean =>
  /\.(md|markdown)$/i.test(value.split(/[?#]/, 1)[0] ?? '')

const isSupportedWorkspaceFilePath = (value: string): boolean => {
  const pathname = value.split(/[?#]/, 1)[0]?.toLowerCase() ?? ''
  return SUPPORTED_WORKSPACE_FILE_EXTENSIONS.some((extension) =>
    pathname.endsWith(extension),
  )
}

const buildWorkspaceFileUrl = (path: string): string =>
  `${WORKSPACE_FILE_ROUTE}?path=${encodeURIComponent(path)}`

const unwrapPseudoAnchorArtifactPath = (value: string): string => {
  const raw = value.trim()
  if (!raw.startsWith('#')) return raw
  const candidate = raw.slice(1).trim()
  if (!candidate) return raw
  if (
    candidate.startsWith(STATE_FILE_PREFIX) ||
    candidate.startsWith('file:') ||
    extractStateRelative(candidate)
  )
    return candidate
  return raw
}

export const toArtifactUrl = (
  value: string | null | undefined,
): string | null => {
  const raw = value ? unwrapPseudoAnchorArtifactPath(value) : undefined
  if (!raw || raw.startsWith('#')) return null
  if (raw.startsWith(STATE_FILE_PREFIX)) {
    if (isArchiveMarkdownPath(raw)) return buildArchiveViewerUrlFromSource(raw)
    return null
  }
  if (hasScheme(raw) && !raw.startsWith('file:') && !isWindowsDrivePath(raw))
    return null

  let path = ''
  let suffix = ''
  if (raw.startsWith('file:')) {
    try {
      const url = new URL(raw)
      path = url.pathname
      suffix = `${url.search}${url.hash}`
    } catch {
      return null
    }
  } else {
    const split = splitPathSuffix(raw)
    path = split.path
    suffix = split.suffix
  }

  const stateRelative = extractStateRelative(path)
  if (stateRelative) {
    const normalizedState = normalizeRelativePath(stateRelative)
    if (!normalizedState) return null
    const artifactUrl = `${STATE_FILE_PREFIX}${encodeRelativePath(normalizedState)}${suffix}`
    if (isArchiveMarkdownPath(normalizedState))
      return buildArchiveViewerUrlFromSource(artifactUrl)
    return artifactUrl
  }

  if (!isWindowsDrivePath(path) && !path.startsWith('/')) return null
  if (!isSupportedWorkspaceFilePath(path)) return null
  const workspaceUrl = buildWorkspaceFileUrl(path)
  return isMarkdownPath(path)
    ? buildArchiveViewerUrlFromSource(workspaceUrl)
    : workspaceUrl
}

export const linkifyInlineCode = (fragment: ParentNode): void => {
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
