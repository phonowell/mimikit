const normalizeStatusValue = (value) => {
  if (value == null) return ''
  const text = typeof value === 'string' ? value : String(value)
  return text.trim()
}

export const formatStatusText = (value) => {
  const text = normalizeStatusValue(value)
  return text ? text.toUpperCase() : ''
}

export const setStatusText = (statusText, value) => {
  if (!statusText) return
  statusText.textContent = formatStatusText(value)
}

export const setStatusState = (statusDot, state) => {
  if (!statusDot) return
  statusDot.dataset.state = state ? String(state) : ''
}

export const applyStatus = ({ statusDot, statusText }, value) => {
  setStatusState(statusDot, value)
  setStatusText(statusText, value)
}

export const clearStatus = ({ statusDot, statusText }, label = '') => {
  setStatusState(statusDot, '')
  setStatusText(statusText, label)
}
