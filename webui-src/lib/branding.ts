import { UI_TEXT } from './system-text.js'

import type { FocusView, StatusSnapshot } from '../types.js'

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

const resolveFocusActivityAtMs = (focus: FocusView): number => {
  const source = focus.lastActivityAt || focus.updatedAt
  const parsed = Date.parse(source)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

export const resolveDocumentTitle = (focuses: readonly FocusView[]): string => {
  let bestActive: FocusView | null = null
  let bestFallback: FocusView | null = null

  for (const focus of focuses) {
    const currentTarget = focus.status === 'active' ? bestActive : bestFallback
    if (!currentTarget) {
      if (focus.status === 'active') bestActive = focus
      else bestFallback = focus
      continue
    }
    const focusActivity = resolveFocusActivityAtMs(focus)
    const targetActivity = resolveFocusActivityAtMs(currentTarget)
    if (
      focusActivity > targetActivity ||
      (focusActivity === targetActivity &&
        focus.id.localeCompare(currentTarget.id) > 0)
    ) {
      if (focus.status === 'active') bestActive = focus
      else bestFallback = focus
    }
  }

  const title = normalizeTitle((bestActive ?? bestFallback)?.title)
  return title || UI_TEXT.conversationTitleFallback
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
  focuses: readonly FocusView[],
): void => {
  const nextTitle = resolveDocumentTitle(focuses)
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
