import { formatDisplayTimeWithFull } from './messages/format-time.js'

export const appendMetaTime = (meta, className, value) => {
  if (!meta || typeof value !== 'string') return
  const changedAt = value.trim()
  if (!changedAt) return
  const changedDisplay = formatDisplayTimeWithFull(changedAt)
  const time = document.createElement('span')
  time.className = className
  time.textContent = changedDisplay.displayText || changedAt
  time.title = changedDisplay.fullText || changedAt
  meta.appendChild(time)
}
