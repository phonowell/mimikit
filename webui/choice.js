import { fetchWithTimeout } from './fetch-with-timeout.js'
import { UI_TEXT } from './system-text.js'

const CHOICE_REQUEST_TIMEOUT_MS = 15000
const COUNTDOWN_TICK_MS = 1000

const normalizeChoiceOption = (value) => {
  if (!value || typeof value !== 'object') return null
  const item = value
  const id = typeof item.id === 'string' ? item.id.trim() : ''
  const label = typeof item.label === 'string' ? item.label.trim() : ''
  const reason = typeof item.reason === 'string' ? item.reason.trim() : ''
  if (!id || !label || !reason) return null
  return { id, label, reason }
}

const reorderOptionsWithDefaultFirst = (options, defaultOptionId) => {
  const defaultIndex = options.findIndex((item) => item.id === defaultOptionId)
  if (defaultIndex <= 0) return options
  return [
    options[defaultIndex],
    ...options.slice(0, defaultIndex),
    ...options.slice(defaultIndex + 1),
  ]
}

const normalizeChoicePayload = (value) => {
  if (!value || typeof value !== 'object') return null
  const payload = value
  const id = typeof payload.id === 'string' ? payload.id.trim() : ''
  const question =
    typeof payload.question === 'string' ? payload.question.trim() : ''
  const defaultOptionId =
    typeof payload.defaultOptionId === 'string'
      ? payload.defaultOptionId.trim()
      : ''
  const expiresAt =
    typeof payload.expiresAt === 'string' ? payload.expiresAt.trim() : ''
  const optionsRaw = Array.isArray(payload.options) ? payload.options : []
  const options = optionsRaw
    .map(normalizeChoiceOption)
    .filter((item) => item !== null)
  if (!id || !question || !defaultOptionId || !expiresAt || options.length < 2)
    return null
  if (!options.some((item) => item.id === defaultOptionId)) return null
  const orderedOptions = reorderOptionsWithDefaultFirst(options, defaultOptionId)
  return {
    id,
    question,
    options: orderedOptions,
    defaultOptionId,
    expiresAt,
  }
}

const formatRemaining = (expiresAt, nowMs = Date.now()) => {
  const expiresAtMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiresAtMs)) return ''
  const remainingMs = Math.max(0, expiresAtMs - nowMs)
  const totalSeconds = Math.floor(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const resolveDefaultLabel = (choice) =>
  choice.options.find((item) => item.id === choice.defaultOptionId)?.label ??
  choice.defaultOptionId

export const bindChoicePanel = ({
  panel,
  questionEl,
  optionsEl,
  metaEl,
  onPanelVisibilityWillChange,
  onPanelVisibilityDidChange,
}) => {
  if (!(panel instanceof HTMLElement)) {
    return {
      applyChoiceSnapshot: () => {},
      setDisconnected: () => {},
    }
  }

  let choice = null
  let timer = null
  let pendingOptionId = ''
  let metaOverride = ''

  const clearTicker = () => {
    if (timer === null) return
    window.clearInterval(timer)
    timer = null
  }

  const setPanelVisibility = (visible) => {
    const nextHidden = !visible
    if (panel.hidden === nextHidden) return
    if (typeof onPanelVisibilityWillChange === 'function')
      onPanelVisibilityWillChange({ visible })
    panel.hidden = nextHidden
    if (typeof onPanelVisibilityDidChange === 'function')
      onPanelVisibilityDidChange({ visible })
  }

  const updateMeta = () => {
    if (!(metaEl instanceof HTMLElement)) return
    if (!choice) {
      metaEl.textContent = ''
      return
    }
    if (metaOverride) {
      metaEl.textContent = metaOverride
      return
    }
    const remaining = formatRemaining(choice.expiresAt)
    const defaultLabel = resolveDefaultLabel(choice)
    metaEl.textContent = remaining
      ? `${UI_TEXT.choiceDefaultIn} ${remaining} · ${UI_TEXT.choiceDefaultOption} ${defaultLabel}`
      : `${UI_TEXT.choiceDefaultOption} ${defaultLabel}`
  }

  const renderOptions = () => {
    if (!(optionsEl instanceof HTMLElement)) return
    optionsEl.replaceChildren()
    if (!choice) return
    for (const option of choice.options) {
      const isDefaultOption = option.id === choice.defaultOptionId
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'choice-tab'
      button.setAttribute('role', 'tab')
      button.setAttribute(
        'aria-selected',
        pendingOptionId === option.id ? 'true' : 'false',
      )
      if (isDefaultOption) button.dataset.recommended = 'true'
      if (isDefaultOption) {
        button.setAttribute(
          'aria-label',
          `${option.label} (${UI_TEXT.choiceRecommended})`,
        )
      }
      if (pendingOptionId) button.disabled = true
      button.dataset.optionId = option.id

      const label = document.createElement('span')
      label.className = 'choice-tab-label'
      const labelText = document.createElement('span')
      labelText.className = 'choice-tab-label-text'
      labelText.textContent = option.label
      label.appendChild(labelText)
      if (isDefaultOption) {
        const badge = document.createElement('span')
        badge.className = 'choice-tab-badge'
        badge.textContent = UI_TEXT.choiceRecommended
        label.appendChild(badge)
      }
      const reason = document.createElement('span')
      reason.className = 'choice-tab-reason'
      reason.textContent = option.reason
      button.appendChild(label)
      button.appendChild(reason)
      button.addEventListener('click', () => {
        if (!choice || pendingOptionId) return
        void requestSelect(option.id)
      })
      optionsEl.appendChild(button)
    }
  }

  const render = () => {
    if (!choice) {
      setPanelVisibility(false)
      clearTicker()
      return
    }
    setPanelVisibility(true)
    if (questionEl instanceof HTMLElement) questionEl.textContent = choice.question
    renderOptions()
    updateMeta()
    if (timer === null) {
      timer = window.setInterval(() => {
        if (!choice) {
          clearTicker()
          return
        }
        updateMeta()
      }, COUNTDOWN_TICK_MS)
    }
  }

  const requestSelect = async (optionId) => {
    if (!choice) return
    pendingOptionId = optionId
    metaOverride = UI_TEXT.choiceSubmitting
    render()
    try {
      const res = await fetchWithTimeout(
        `/api/choices/${encodeURIComponent(choice.id)}/select`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optionId }),
        },
        CHOICE_REQUEST_TIMEOUT_MS,
      )
      if (!res.ok) {
        let data = null
        try {
          data = await res.json()
        } catch {
          data = null
        }
        throw new Error(data?.error || UI_TEXT.choiceSelectFailed)
      }
      metaOverride = UI_TEXT.choiceSubmitted
      updateMeta()
    } catch (error) {
      pendingOptionId = ''
      metaOverride =
        error instanceof Error ? `${UI_TEXT.choiceSelectFailed}: ${error.message}` : UI_TEXT.choiceSelectFailed
      render()
    }
  }

  const applyChoiceSnapshot = (payload) => {
    choice = normalizeChoicePayload(payload)
    pendingOptionId = ''
    metaOverride = ''
    render()
  }

  const setDisconnected = () => {
    if (!choice) return
    metaOverride = UI_TEXT.connectionLost
    updateMeta()
  }

  return {
    applyChoiceSnapshot,
    setDisconnected,
  }
}
