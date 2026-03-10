import { fetchWithTimeout } from './fetch-with-timeout.js'
import { renderEmptyListState } from './list-empty.js'
import { UI_TEXT } from './system-text.js'

const EMPTY_REVIEW_STATUS = {
  cards: [],
  highlights: [],
}
const REVIEW_BOARD_REQUEST_TIMEOUT_MS = 15000

const normalizeCards = (value) =>
  Array.isArray(value)
    ? value.filter(
        (item) =>
          item &&
          typeof item.id === 'string' &&
          typeof item.label === 'string' &&
          typeof item.value === 'number',
      )
    : []

const normalizeHighlights = (value) =>
  Array.isArray(value)
    ? value.filter(
        (item) =>
          item &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.detail === 'string',
      )
    : []

const normalizeReviewStatus = (value) => {
  if (!value || typeof value !== 'object') return EMPTY_REVIEW_STATUS
  return {
    cards: normalizeCards(value.cards),
    highlights: normalizeHighlights(value.highlights),
  }
}

const resolveCardValue = (cards, id) =>
  cards.find((item) => item.id === id)?.value ?? 0

const renderCard = (item) => {
  const card = document.createElement('article')
  card.className = 'review-card'
  card.dataset.tone = typeof item.tone === 'string' ? item.tone : 'neutral'

  const label = document.createElement('p')
  label.className = 'review-card-label'
  label.textContent = item.label

  const value = document.createElement('p')
  value.className = 'review-card-value'
  value.textContent = String(item.value)

  card.append(label, value)
  return card
}

const renderHighlight = (item) => {
  const node = document.createElement('li')
  node.className = 'review-highlight'
  node.dataset.tone = typeof item.tone === 'string' ? item.tone : 'neutral'

  const title = document.createElement('p')
  title.className = 'review-highlight-title'
  title.textContent = item.title

  const detail = document.createElement('p')
  detail.className = 'review-highlight-detail'
  detail.textContent = item.detail

  node.append(title, detail)
  return node
}

export const bindReviewStatusPanel = ({
  section,
  cardsEl,
  actionsEl,
  highlightsEl,
}) => {
  if (
    !(section instanceof HTMLElement) ||
    !(cardsEl instanceof HTMLElement) ||
    !(actionsEl instanceof HTMLElement) ||
    !(highlightsEl instanceof HTMLElement)
  ) {
    return {
      applySnapshot: () => {},
      setDisconnected: () => {},
    }
  }

  let currentCards = []
  let actionBusy = false
  let actionNote = ''

  const renderActions = () => {
    actionsEl.replaceChildren()
    const recoverableCount = resolveCardValue(currentCards, 'recoverable')
    if (recoverableCount <= 0 && !actionNote) return

    if (recoverableCount > 0) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'btn btn--sm'
      button.textContent = actionBusy
        ? UI_TEXT.resumeAllRecoverableBusy
        : UI_TEXT.resumeAllRecoverable
      button.disabled = actionBusy
      button.addEventListener('click', () => {
        if (actionBusy) return
        void requestResumeAllRecoverable()
      })
      actionsEl.appendChild(button)
    }

    if (actionNote) {
      const note = document.createElement('p')
      note.className = 'review-action-note'
      note.textContent = actionNote
      actionsEl.appendChild(note)
    }
  }

  const requestResumeAllRecoverable = async () => {
    actionBusy = true
    actionNote = ''
    renderActions()
    try {
      const response = await fetchWithTimeout(
        '/api/tasks/resume-recoverable',
        { method: 'POST' },
        REVIEW_BOARD_REQUEST_TIMEOUT_MS,
      )
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      actionNote =
        typeof payload?.resumedCount === 'number' && payload.resumedCount > 0
          ? UI_TEXT.resumeAllRecoverableDone
          : UI_TEXT.resumeAllRecoverableNone
    } catch (error) {
      actionNote =
        error instanceof Error
          ? `${UI_TEXT.choiceSelectFailed}: ${error.message}`
          : UI_TEXT.choiceSelectFailed
    } finally {
      actionBusy = false
      renderActions()
    }
  }

  const render = (payload) => {
    const reviewStatus = normalizeReviewStatus(payload)
    currentCards = reviewStatus.cards
    cardsEl.replaceChildren(...reviewStatus.cards.map(renderCard))
    renderActions()
    if (reviewStatus.highlights.length === 0) {
      renderEmptyListState(
        highlightsEl,
        'review-highlights-empty',
        UI_TEXT.noReviewStatus,
      )
      section.hidden = false
      return
    }
    highlightsEl.replaceChildren(
      ...reviewStatus.highlights.map(renderHighlight),
    )
    section.hidden = false
  }

  return {
    applySnapshot: render,
    setDisconnected: () => {
      currentCards = []
      actionBusy = false
      actionNote = UI_TEXT.connectionLost
      renderActions()
      renderEmptyListState(
        highlightsEl,
        'review-highlights-empty',
        UI_TEXT.connectionLost,
      )
    },
  }
}
