import { renderMarkdown } from './markdown.js'

const ROOT = window.location.origin
const TASK_ARCHIVE_API_PATTERN = /^\/api\/tasks\/[^/]+\/archive$/

const stateEl = document.querySelector('[data-state]')
const metaEl = document.querySelector('[data-meta]')
const contentEl = document.querySelector('[data-content]')
const messageEl = document.querySelector('[data-message]')
const sourceEl = document.querySelector('[data-source]')

const updateState = (text) => {
  if (stateEl) stateEl.textContent = text
}

const updateMeta = (text) => {
  if (metaEl) metaEl.textContent = text
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
  pathname.startsWith('/state-files/') ||
  TASK_ARCHIVE_API_PATTERN.test(pathname)

const resolveSourceTarget = () => {
  const params = new URLSearchParams(window.location.search)
  const taskId = params.get('task')?.trim() ?? ''
  if (taskId) {
    return {
      title: `task: ${taskId}`,
      sourceUrl: `/api/tasks/${encodeURIComponent(taskId)}/archive`,
    }
  }
  const source = params.get('src')?.trim() ?? ''
  if (!source) throw new Error('Missing query: task or src')
  const url = new URL(source, ROOT)
  if (url.origin !== ROOT) throw new Error('Only same-origin sources are allowed')
  if (!isAllowedPath(url.pathname)) throw new Error('Unsupported source path')
  return { title: `source: ${url.pathname}`, sourceUrl: `${url.pathname}${url.search}` }
}

const updateSourceLink = (href) => {
  if (!(sourceEl instanceof HTMLAnchorElement)) return
  sourceEl.href = href
  sourceEl.hidden = false
}

const renderArchive = async () => {
  try {
    const target = resolveSourceTarget()
    updateMeta(target.title)
    updateSourceLink(target.sourceUrl)
    const response = await fetch(target.sourceUrl, {
      headers: { Accept: 'text/markdown,text/plain;q=0.9,*/*;q=0.1' },
    })
    if (!response.ok) 
      throw new Error(`Load failed: HTTP ${response.status}`)
    
    const markdown = await response.text()
    if (!contentEl) throw new Error('Missing content container')
    contentEl.replaceChildren(renderMarkdown(markdown))
    showContent()
    document.title = `${target.title} · Archive Viewer`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    showError(message)
    updateMeta('')
    if (sourceEl instanceof HTMLAnchorElement) sourceEl.hidden = true
  }
}

void renderArchive()
