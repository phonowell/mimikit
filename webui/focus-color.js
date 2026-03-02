const FOCUS_HASH_OFFSET = 2166136261
const FOCUS_HASH_PRIME = 16777619
const FOCUS_TONE_COUNT = 12
const FOCUS_TONE_PREFIX = 'focus-tone-'
const FOCUS_TONE_RE = /^focus-tone-\d+$/

const normalizeFocusId = (value) =>
  typeof value === 'string' ? value.trim() : ''

const hashFocusId = (focusId) => {
  let hash = FOCUS_HASH_OFFSET
  for (let index = 0; index < focusId.length; index += 1) {
    hash ^= focusId.charCodeAt(index)
    hash = Math.imul(hash, FOCUS_HASH_PRIME)
  }
  return hash >>> 0
}

const resolveFocusToneClassName = (focusId) => {
  const normalized = normalizeFocusId(focusId)
  if (!normalized) return ''
  const toneIndex = hashFocusId(normalized) % FOCUS_TONE_COUNT
  return `${FOCUS_TONE_PREFIX}${toneIndex}`
}

export const resolveFocusLabel = (focusId) => normalizeFocusId(focusId)

export const applyFocusToneClass = (element, focusId) => {
  if (!element || !element.classList) return ''
  for (const className of [...element.classList])
    if (FOCUS_TONE_RE.test(className)) element.classList.remove(className)
  const toneClass = resolveFocusToneClassName(focusId)
  if (!toneClass) return ''
  element.classList.add(toneClass)
  return toneClass
}
