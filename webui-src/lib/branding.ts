import { UI_TEXT } from './system-text.js'

import type { ConfirmDialogState, StatusSnapshot, TaskView } from '../types.js'

const FAVICON_COLOR_BY_STATE: Record<string, string> = {
  disconnected: '#94a3b8',
  idle: '#22c55e',
  running: '#0ea5e9',
}
const DEFAULT_FAVICON_COLOR = '#94a3b8'
const faviconHrefByColor = new Map<string, string>()

const normalizeTitle = (value: string | undefined): string => {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim()
}

const composeDocumentTitle = (primary: string): string => {
  const normalizedPrimary = normalizeTitle(primary)
  const productName = UI_TEXT.conversationTitleFallback
  if (!normalizedPrimary || normalizedPrimary === productName)
    return productName
  return `${normalizedPrimary} · ${productName}`
}

const resolveTaskActivityAtMs = (task: TaskView): number => {
  const source = task.startedAt || task.changeAt || task.createdAt
  const parsed = Date.parse(source)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

const resolveRunningTaskTitle = (tasks: readonly TaskView[]): string => {
  let bestTask: TaskView | null = null

  for (const task of tasks) {
    if (task.status !== 'running') continue
    if (!bestTask) {
      bestTask = task
      continue
    }
    const taskActivity = resolveTaskActivityAtMs(task)
    const bestActivity = resolveTaskActivityAtMs(bestTask)
    if (
      taskActivity > bestActivity ||
      (taskActivity === bestActivity && task.id.localeCompare(bestTask.id) > 0)
    )
      bestTask = task
  }

  return normalizeTitle(bestTask?.title)
}

const resolveDialogTitle = (dialog: ConfirmDialogState | null): string => {
  if (!dialog) return ''
  if (dialog.kind === 'task') return normalizeTitle(dialog.title)
  if (dialog.kind === 'message') return 'Delete Message'
  if (dialog.kind === 'restart') return 'Restart'
  return 'Reset'
}

export type DocumentTitleContext = {
  confirmDialog: ConfirmDialogState | null
  plansOpen: boolean
  tasks: readonly TaskView[]
  tasksOpen: boolean
}

export const resolveDocumentTitle = ({
  confirmDialog,
  plansOpen,
  tasks,
  tasksOpen,
}: DocumentTitleContext): string => {
  const dialogTitle = resolveDialogTitle(confirmDialog)
  if (dialogTitle) return composeDocumentTitle(dialogTitle)
  if (tasksOpen) return composeDocumentTitle('Tasks')
  if (plansOpen) return composeDocumentTitle('Plans')

  const runningTaskTitle = resolveRunningTaskTitle(tasks)
  if (runningTaskTitle) return composeDocumentTitle(runningTaskTitle)

  return composeDocumentTitle('')
}

const resolveFaviconHref = (color: string): string => {
  const cached = faviconHrefByColor.get(color)
  if (cached) return cached
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="${color}"/></svg>`
  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`
  faviconHrefByColor.set(color, href)
  return href
}

export const syncDocumentBranding = (
  status: StatusSnapshot,
  context: DocumentTitleContext,
): void => {
  const nextTitle = resolveDocumentTitle(context)
  if (document.title !== nextTitle) document.title = nextTitle
  const state = status.agentStatus.trim().toLowerCase() || 'disconnected'
  const color = FAVICON_COLOR_BY_STATE[state] ?? DEFAULT_FAVICON_COLOR
  const href = resolveFaviconHref(color)
  const existing = document.querySelector('link[rel="icon"]')
  const link =
    existing instanceof HTMLLinkElement
      ? existing
      : document.createElement('link')
  link.rel = 'icon'
  if (link.getAttribute('href') !== href) link.href = href
  if (!(existing instanceof HTMLLinkElement)) document.head.appendChild(link)
}
