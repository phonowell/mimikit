import { fetchWithTimeout } from './fetch-with-timeout.js'
import { normalizeChoicesPayload } from './choice-payload.js'
import {
  renderChoiceCards,
  resolveChoiceQuestionText,
  updateChoiceMeta,
} from './choice-view.js'
import { UI_TEXT } from './system-text.js'

const CHOICE_REQUEST_TIMEOUT_MS = 15000
const COUNTDOWN_TICK_MS = 1000

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

  let choices = []
  let timer = null
  let pendingChoiceId = ''
  let pendingOptionId = ''
  let disconnected = false
  const metaOverrideByChoiceId = new Map()

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

  const renderCards = () => {
    renderChoiceCards({
      optionsEl,
      choices,
      pendingChoiceId,
      pendingOptionId,
      disconnected,
      metaOverrideByChoiceId,
      requestSelect,
    })
  }

  const render = () => {
    if (choices.length === 0) {
      setPanelVisibility(false)
      clearTicker()
      return
    }
    setPanelVisibility(true)
    if (questionEl instanceof HTMLElement)
      questionEl.textContent = resolveChoiceQuestionText(choices)

    renderCards()
    updateChoiceMeta(metaEl, choices)
    if (choices.some((choice) => choice.expiresAt) && timer === null) {
      timer = window.setInterval(() => {
        if (choices.length === 0) {
          clearTicker()
          return
        }
        if (!choices.some((choice) => choice.expiresAt)) {
          clearTicker()
          return
        }
        renderCards()
      }, COUNTDOWN_TICK_MS)
    }
  }

  const requestChoiceSelection = async (choiceId, optionId) => {
    const res = await fetchWithTimeout(
      `/api/choices/${encodeURIComponent(choiceId)}/select`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId }),
      },
      CHOICE_REQUEST_TIMEOUT_MS,
    )
    if (res.ok) return

    let data = null
    try {
      data = await res.json()
    } catch {
      data = null
    }
    throw new Error(data?.error || 'choice select failed')
  }

  const requestSelect = async (choiceId, optionId) => {
    const choice = choices.find((item) => item.id === choiceId)
    if (!choice) return
    disconnected = false
    pendingChoiceId = choiceId
    pendingOptionId = optionId
    metaOverrideByChoiceId.set(choiceId, UI_TEXT.choiceSubmitting)
    render()
    try {
      await requestChoiceSelection(choiceId, optionId)
      metaOverrideByChoiceId.set(choiceId, UI_TEXT.choiceSubmitted)
      render()
    } catch (error) {
      pendingChoiceId = ''
      pendingOptionId = ''
      metaOverrideByChoiceId.set(
        choiceId,
        error instanceof Error
          ? `${UI_TEXT.choiceSelectFailed}: ${error.message}`
          : UI_TEXT.choiceSelectFailed,
      )
      render()
    }
  }

  const applyChoiceSnapshot = (payload) => {
    choices = normalizeChoicesPayload(payload)
    disconnected = false
    pendingChoiceId = ''
    pendingOptionId = ''
    metaOverrideByChoiceId.clear()
    render()
  }

  const setDisconnected = () => {
    if (choices.length === 0) return
    disconnected = true
    render()
  }

  return {
    applyChoiceSnapshot,
    setDisconnected,
  }
}
