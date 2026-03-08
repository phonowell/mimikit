import { UI_TEXT } from './system-text.js'

const FAVICON_COLOR_BY_STATE = {
  idle: '#22c55e',
  running: '#0ea5e9',
  disconnected: '#94a3b8',
}

let faviconLinkEl = null

const resolveStatusState = (statusDot) => {
  const state = statusDot?.dataset.state?.trim()?.toLowerCase()
  if (!state) return 'disconnected'
  return state
}

const resolveFaviconColor = (statusDot) => {
  const state = resolveStatusState(statusDot)
  return FAVICON_COLOR_BY_STATE[state] ?? FAVICON_COLOR_BY_STATE.disconnected
}

const buildStatusFaviconHref = (color) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="${color}"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const ensureFaviconLink = () => {
  if (faviconLinkEl instanceof HTMLLinkElement) return faviconLinkEl
  const existing = document.querySelector('link[rel="icon"]')
  if (existing instanceof HTMLLinkElement) {
    faviconLinkEl = existing
    return faviconLinkEl
  }
  const link = document.createElement('link')
  link.rel = 'icon'
  document.head.appendChild(link)
  faviconLinkEl = link
  return faviconLinkEl
}

const normalizeFocusTitle = (value) => {
  if (typeof value !== 'string') return ''
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact || ''
}

const resolveFocusActivityAtMs = (item) => {
  const lastActivityAt =
    typeof item?.lastActivityAt === 'string' && item.lastActivityAt.trim()
      ? item.lastActivityAt
      : typeof item?.updatedAt === 'string' && item.updatedAt.trim()
        ? item.updatedAt
        : ''
  if (!lastActivityAt) return Number.NEGATIVE_INFINITY
  const parsed = Date.parse(lastActivityAt)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

const resolveMostActiveFocusTitle = (focusesSnapshot) => {
  const rawItems = Array.isArray(focusesSnapshot?.items) ? focusesSnapshot.items : []
  if (rawItems.length === 0) return ''

  const activeCandidates = []
  const fallbackCandidates = []
  for (let index = 0; index < rawItems.length; index += 1) {
    const item = rawItems[index]
    if (!item || typeof item !== 'object') continue
    const title = normalizeFocusTitle(item.title)
    if (!title) continue

    const candidate = { item, index, title }
    fallbackCandidates.push(candidate)
    if (typeof item.status === 'string' && item.status.trim().toLowerCase() === 'active') 
      activeCandidates.push(candidate)
    
  }

  const candidates = activeCandidates.length > 0 ? activeCandidates : fallbackCandidates
  if (candidates.length === 0) return ''

  let latestCandidate = candidates[0]
  let latestActivityAtMs = resolveFocusActivityAtMs(latestCandidate.item)

  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    const activityAtMs = resolveFocusActivityAtMs(candidate.item)
    if (activityAtMs > latestActivityAtMs) {
      latestCandidate = candidate
      latestActivityAtMs = activityAtMs
      continue
    }
    if (activityAtMs === latestActivityAtMs && candidate.index > latestCandidate.index) 
      latestCandidate = candidate
    
  }

  return latestCandidate.title
}

export const createBrandingController = ({ statusDot } = {}) => {
  const syncFavicon = () => {
    const link = ensureFaviconLink()
    const href = buildStatusFaviconHref(resolveFaviconColor(statusDot))
    if (link.href === href) return
    link.href = href
  }

  const syncTitle = (focusesSnapshot) => {
    const titleCandidate = resolveMostActiveFocusTitle(focusesSnapshot)
    document.title = titleCandidate || UI_TEXT.conversationTitleFallback
  }

  const bind = () => {
    syncFavicon()
    if (!(statusDot instanceof HTMLElement) || typeof MutationObserver !== 'function') 
      return () => {}
    
    const observer = new MutationObserver(syncFavicon)
    observer.observe(statusDot, {
      attributes: true,
      attributeFilter: ['data-state'],
    })
    return () => {
      observer.disconnect()
    }
  }

  return {
    bind,
    syncTitle,
  }
}
