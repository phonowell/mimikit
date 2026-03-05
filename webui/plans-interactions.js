import { buildTaskArchiveViewerUrl } from './archive-viewer-url.js'

export const bindPlanInteractions = (plansList) => {
  if (!plansList) return () => {}

  const onListClick = (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const link = target.closest('.plan-link')
    if (!link) return
    const openable = link.getAttribute('data-archive-openable') === 'true'
    if (!openable) return
    event.preventDefault()
    const taskId = link.getAttribute('data-task-id') || ''
    const archiveUrl = buildTaskArchiveViewerUrl(taskId)
    const opened = window.open(archiveUrl, '_blank', 'noopener,noreferrer')
    if (!opened) console.warn('[webui] open plan archive failed', 'popup blocked')
  }

  plansList.addEventListener('click', onListClick)

  return () => {
    plansList.removeEventListener('click', onListClick)
  }
}
