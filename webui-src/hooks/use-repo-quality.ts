import { useEffect, useState } from 'react'

import { loadRepoQualitySummary } from '../lib/repo-quality.js'

export const REPO_QUALITY_REFRESH_MS = 30_000

type RemoveListener = () => void

type RepoQualityAutoRefreshOptions = {
  loadSummary?: () => Promise<string>
  setSummary: (summary: string) => void
  refreshMs?: number
  addWindowListener?: (type: 'focus', listener: () => void) => RemoveListener
  addDocumentListener?: (
    type: 'visibilitychange',
    listener: () => void,
  ) => RemoveListener
  isDocumentVisible?: () => boolean
  setIntervalFn?: typeof globalThis.setInterval
  clearIntervalFn?: typeof globalThis.clearInterval
}

const noop = (): void => {}

const addWindowListener = (
  type: 'focus',
  listener: () => void,
): RemoveListener => {
  if (typeof window === 'undefined') return noop
  window.addEventListener(type, listener)
  return () => {
    window.removeEventListener(type, listener)
  }
}

const addDocumentListener = (
  type: 'visibilitychange',
  listener: () => void,
): RemoveListener => {
  if (typeof document === 'undefined') return noop
  document.addEventListener(type, listener)
  return () => {
    document.removeEventListener(type, listener)
  }
}

const isDocumentVisible = (): boolean =>
  typeof document === 'undefined' || document.visibilityState === 'visible'

export const startRepoQualityAutoRefresh = (
  options: RepoQualityAutoRefreshOptions,
): RemoveListener => {
  const loadSummary = options.loadSummary ?? loadRepoQualitySummary
  const refreshMs = options.refreshMs ?? REPO_QUALITY_REFRESH_MS
  const listenForFocus = options.addWindowListener ?? addWindowListener
  const listenForVisibility = options.addDocumentListener ?? addDocumentListener
  const isVisible = options.isDocumentVisible ?? isDocumentVisible
  const setIntervalFn = options.setIntervalFn ?? globalThis.setInterval
  const clearIntervalFn = options.clearIntervalFn ?? globalThis.clearInterval
  let disposed = false
  let inFlight = false

  const refresh = (): void => {
    if (disposed || inFlight) return
    inFlight = true
    void loadSummary()
      .then((next) => {
        if (!disposed && next) options.setSummary(next)
      })
      .finally(() => {
        inFlight = false
      })
  }

  const interval = setIntervalFn(refresh, refreshMs)
  const removeFocusListener = listenForFocus('focus', refresh)
  const removeVisibilityListener = listenForVisibility(
    'visibilitychange',
    () => {
      if (isVisible()) refresh()
    },
  )

  refresh()

  return () => {
    disposed = true
    clearIntervalFn(interval)
    removeFocusListener()
    removeVisibilityListener()
  }
}

export const useRepoQuality = (): string => {
  const [summary, setSummary] = useState('')

  useEffect(() => startRepoQualityAutoRefresh({ setSummary }), [])

  return summary
}
