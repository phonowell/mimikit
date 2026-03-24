const ARCHIVE_VIEWER_PATH = '/archive-viewer.html'

export const buildArchiveViewerUrlFromSource = (sourceUrl: string): string =>
  `${ARCHIVE_VIEWER_PATH}?src=${encodeURIComponent(sourceUrl)}`

export const buildTaskArchiveViewerUrl = (taskId: string): string =>
  `${ARCHIVE_VIEWER_PATH}?task=${encodeURIComponent(taskId)}`

export const isArchiveMarkdownPath = (value: string): boolean => {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  const path = trimmed.split(/[?#]/, 1)[0]?.toLowerCase() ?? ''
  const isMarkdown = path.endsWith('.md') || path.endsWith('.markdown')
  if (!isMarkdown) return false
  return path.startsWith('tasks/') || path.includes('/tasks/')
}
