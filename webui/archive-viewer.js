import { renderMarkdown } from './markdown.js'
import { buildArchiveViewerUrlFromSource } from './archive-viewer-url.js'

const ROOT = window.location.origin
const TASK_ARCHIVE_API_PATTERN = /^\/api\/tasks\/[^/]+\/archive$/
const NUMBER_FORMAT = new Intl.NumberFormat('en-US')
const MARKDOWN_PATH_PATTERN = /\.(md|markdown)$/i
const RAW_PARAM = 'raw'
const RAW_PARAM_VALUE = '1'

const stateEl = document.querySelector('[data-state]')
const titleEl = document.querySelector('[data-title]')
const metaEl = document.querySelector('[data-meta]')
const contentTagEl = document.querySelector('[data-content-tag]')
const contentEl = document.querySelector('[data-content]')
const messageEl = document.querySelector('[data-message]')
const sourceEl = document.querySelector('[data-source]')
const statLinesEl = document.querySelector('[data-stat-lines]')
const statWordsEl = document.querySelector('[data-stat-words]')
const statCharsEl = document.querySelector('[data-stat-chars]')
const statCodeEl = document.querySelector('[data-stat-code]')
const statReadEl = document.querySelector('[data-stat-read]')

const setText = (el, text) => {
  if (el) el.textContent = text
}

const setNumberText = (el, value) => {
  if (el) el.textContent = NUMBER_FORMAT.format(value)
}

const updateState = (text) => {
  setText(stateEl, text)
}

const updateTitle = (text) => {
  setText(titleEl, text)
}

const updateMeta = (text) => {
  setText(metaEl, text)
}

const updateContentTag = (text) => {
  setText(contentTagEl, text)
}

const resetStats = () => {
  setText(statLinesEl, '--')
  setText(statWordsEl, '--')
  setText(statCharsEl, '--')
  setText(statCodeEl, '--')
  setText(statReadEl, '--')
}

const updateStats = (markdown) => {
  const lines = markdown.length ? markdown.split(/\r?\n/).length : 0
  const words = (markdown.match(/[^\s]+/g) ?? []).length
  const chars = [...markdown].length
  const fenceMarkers = (markdown.match(/^\s*```/gm) ?? []).length
  const codeBlocks = Math.ceil(fenceMarkers / 2)
  const readingUnit = words + Math.floor(chars / 4)
  const readMinutes = readingUnit === 0 ? 0 : Math.max(1, Math.ceil(readingUnit / 220))

  setNumberText(statLinesEl, lines)
  setNumberText(statWordsEl, words)
  setNumberText(statCharsEl, chars)
  setNumberText(statCodeEl, codeBlocks)
  setText(statReadEl, readMinutes === 0 ? '0m' : `${readMinutes}m`)
}

const showContent = () => {
  if (messageEl) messageEl.hidden = false
  if (stateEl) stateEl.hidden = true
}

const showError = (text) => {
  updateState(text)
  if (messageEl) messageEl.hidden = true
  if (stateEl) stateEl.hidden = false
}

const isAllowedPath = (pathname) =>
  pathname.startsWith('/state-files/') || TASK_ARCHIVE_API_PATTERN.test(pathname)

const withRawSourceParam = (sourceUrl) => {
  const base = new URL(sourceUrl, ROOT)
  if (!base.pathname.startsWith('/state-files/')) return sourceUrl
  if (base.searchParams.get(RAW_PARAM) === RAW_PARAM_VALUE) return sourceUrl
  base.searchParams.set(RAW_PARAM, RAW_PARAM_VALUE)
  return `${base.pathname}${base.search}${base.hash}`
}

const toArchiveViewerMarkdownUrl = (rawHref, sourceUrl) => {
  const href = rawHref?.trim() ?? ''
  if (!href || href.startsWith('#')) return null
  const sourceBase = new URL(sourceUrl, ROOT)
  const resolved = new URL(href, sourceBase)
  if (resolved.origin !== ROOT) return null
  if (!isAllowedPath(resolved.pathname)) return null
  if (!MARKDOWN_PATH_PATTERN.test(resolved.pathname)) return null
  return buildArchiveViewerUrlFromSource(
    `${resolved.pathname}${resolved.search}${resolved.hash}`,
  )
}

const rewriteMarkdownLinks = (container, sourceUrl) => {
  const links = container.querySelectorAll('a[href]')
  for (const link of links) {
    if (!(link instanceof HTMLAnchorElement)) continue
    const viewerUrl = toArchiveViewerMarkdownUrl(
      link.getAttribute('href'),
      sourceUrl,
    )
    if (!viewerUrl) continue
    link.setAttribute('href', viewerUrl)
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  }
}

const buildContentTag = (value) => {
  const trimmed = value.trim()
  if (!trimmed) return 'Rendered markdown'
  if (trimmed.length <= 48) return trimmed
  return `${trimmed.slice(0, 45)}...`
}

const resolveSourceTarget = () => {
  const params = new URLSearchParams(window.location.search)
  const taskId = params.get('task')?.trim() ?? ''
  if (taskId) {
    return {
      pageTitle: 'Task Archive',
      meta: `task: ${taskId}`,
      sourceUrl: `/api/tasks/${encodeURIComponent(taskId)}/archive`,
      contentTag: `task/${taskId}`,
    }
  }

  const source = params.get('src')?.trim() ?? ''
  if (!source) throw new Error('Missing query: task or src')
  const url = new URL(source, ROOT)
  if (url.origin !== ROOT) throw new Error('Only same-origin sources are allowed')
  if (!isAllowedPath(url.pathname)) throw new Error('Unsupported source path')

  return {
    pageTitle: 'Markdown Archive',
    meta: `source: ${url.pathname}`,
    sourceUrl: `${url.pathname}${url.search}`,
    contentTag: url.pathname,
  }
}

const updateSourceLink = (href) => {
  if (!(sourceEl instanceof HTMLAnchorElement)) return
  sourceEl.href = withRawSourceParam(href)
  sourceEl.hidden = false
}

const renderArchive = async () => {
  try {
    const target = resolveSourceTarget()
    updateTitle(target.pageTitle)
    updateMeta(target.meta)
    updateContentTag(buildContentTag(target.contentTag))
    updateSourceLink(target.sourceUrl)

    const fetchSourceUrl = withRawSourceParam(target.sourceUrl)
    const response = await fetch(fetchSourceUrl, {
      headers: { Accept: 'text/markdown,text/plain;q=0.9,*/*;q=0.1' },
    })
    if (!response.ok) throw new Error(`Load failed: HTTP ${response.status}`)

    const markdown = await response.text()
    if (!contentEl) throw new Error('Missing content container')

    const rendered = renderMarkdown(markdown)
    rewriteMarkdownLinks(rendered, fetchSourceUrl)
    contentEl.replaceChildren(rendered)
    updateStats(markdown)
    showContent()
    document.title = `${target.pageTitle} · Archive Viewer`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    showError(message)
    updateTitle('Archive Viewer')
    updateMeta('')
    resetStats()
    if (sourceEl instanceof HTMLAnchorElement) sourceEl.hidden = true
  }
}

void renderArchive()
