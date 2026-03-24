import { UI_TEXT } from '../../webui/system-text.js'

import type { FocusView, StatusSnapshot } from '../types.js'

const FAVICON_COLOR_BY_STATE: Record<string, string> = {
  disconnected: '#94a3b8',
  idle: '#22c55e',
  running: '#0ea5e9',
}

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
  const active = focuses.filter((focus) => focus.status === 'active')
  const candidates = active.length > 0 ? active : focuses
  const sorted = [...candidates].sort((left, right) => {
    const diff =
      resolveFocusActivityAtMs(right) - resolveFocusActivityAtMs(left)
    if (diff !== 0) return diff
    return right.id.localeCompare(left.id)
  })
  const title = normalizeTitle(sorted[0]?.title)
  return title || UI_TEXT.conversationTitleFallback
}

export const syncDocumentBranding = (
  status: StatusSnapshot,
  focuses: readonly FocusView[],
): void => {
  document.title = resolveDocumentTitle(focuses)
  const state = status.agentStatus.trim().toLowerCase() || 'disconnected'
  const color =
    FAVICON_COLOR_BY_STATE[state] ?? FAVICON_COLOR_BY_STATE.disconnected
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="${color}"/></svg>`
  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`
  const existing = document.querySelector('link[rel="icon"]')
  const link =
    existing instanceof HTMLLinkElement
      ? existing
      : document.createElement('link')
  link.rel = 'icon'
  link.href = href
  if (!(existing instanceof HTMLLinkElement)) document.head.appendChild(link)
}
