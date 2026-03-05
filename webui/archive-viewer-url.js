const ARCHIVE_VIEWER_PATH = '/archive-viewer.html'

export const isArchiveMarkdownPath = (value) => {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  const path = trimmed.split(/[?#]/, 1)[0]?.toLowerCase() ?? ''
  const isMarkdown = path.endsWith('.md') || path.endsWith('.markdown')
  if (!isMarkdown) return false
  return path.startsWith('tasks/') || path.includes('/tasks/')
}

export const buildArchiveViewerUrlFromSource = (sourceUrl) =>
  `${ARCHIVE_VIEWER_PATH}?src=${encodeURIComponent(sourceUrl)}`

export const buildTaskArchiveViewerUrl = (taskId) =>
  `${ARCHIVE_VIEWER_PATH}?task=${encodeURIComponent(taskId)}`
