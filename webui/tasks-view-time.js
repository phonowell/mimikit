import { formatElapsedLabel } from './messages/format-usage.js'

const ELAPSED_TICK_MS = 1000

export const formatElapsedText = (elapsedMs, hasUsage) => {
  const label = formatElapsedLabel(elapsedMs)
  if (!label) return ''
  return hasUsage ? `· ${label}` : label
}

export const updateElapsedTimes = (tasksList) => {
  if (!tasksList) return
  const now = Date.now()
  const items = tasksList.querySelectorAll('[data-elapsed][data-started-at]')
  for (const item of items) {
    if (!(item instanceof HTMLElement)) continue
    const startedAt = Number(item.dataset.startedAt)
    if (!Number.isFinite(startedAt)) continue
    const elapsedMs = Math.max(0, now - startedAt)
    const hasUsage = item.dataset.hasUsage === 'true'
    item.textContent = formatElapsedText(elapsedMs, hasUsage)
  }
}

export const createElapsedTicker = (tasksList) => {
  let timer = null
  const start = () => {
    if (timer) return
    updateElapsedTimes(tasksList)
    timer = window.setInterval(() => updateElapsedTimes(tasksList), ELAPSED_TICK_MS)
  }
  const stop = () => {
    if (!timer) return
    window.clearInterval(timer)
    timer = null
  }
  const update = () => updateElapsedTimes(tasksList)
  return { start, stop, update }
}
