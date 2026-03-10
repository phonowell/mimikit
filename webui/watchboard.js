import { renderEmptyListState } from './list-empty.js'
import { UI_TEXT } from './system-text.js'

const EMPTY_DUTY_STATUS = {
  cards: [],
  highlights: [],
}

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

const normalizeDutyStatus = (value) => {
  if (!value || typeof value !== 'object') return EMPTY_DUTY_STATUS
  return {
    cards: normalizeCards(value.cards),
    highlights: normalizeHighlights(value.highlights),
  }
}

const renderCard = (item) => {
  const card = document.createElement('article')
  card.className = 'duty-card'
  card.dataset.tone = typeof item.tone === 'string' ? item.tone : 'neutral'

  const label = document.createElement('p')
  label.className = 'duty-card-label'
  label.textContent = item.label

  const value = document.createElement('p')
  value.className = 'duty-card-value'
  value.textContent = String(item.value)

  card.append(label, value)
  return card
}

const renderHighlight = (item) => {
  const node = document.createElement('li')
  node.className = 'duty-highlight'
  node.dataset.tone = typeof item.tone === 'string' ? item.tone : 'neutral'

  const title = document.createElement('p')
  title.className = 'duty-highlight-title'
  title.textContent = item.title

  const detail = document.createElement('p')
  detail.className = 'duty-highlight-detail'
  detail.textContent = item.detail

  node.append(title, detail)
  return node
}

export const bindDutyStatusPanel = ({ section, cardsEl, highlightsEl }) => {
  if (
    !(section instanceof HTMLElement) ||
    !(cardsEl instanceof HTMLElement) ||
    !(highlightsEl instanceof HTMLElement)
  ) {
    return {
      applySnapshot: () => {},
      setDisconnected: () => {},
    }
  }

  const render = (payload) => {
    const dutyStatus = normalizeDutyStatus(payload)
    cardsEl.replaceChildren(...dutyStatus.cards.map(renderCard))
    if (dutyStatus.highlights.length === 0) {
      renderEmptyListState(
        highlightsEl,
        'duty-highlights-empty',
        UI_TEXT.noDutyStatus,
      )
      section.hidden = false
      return
    }
    highlightsEl.replaceChildren(
      ...dutyStatus.highlights.map(renderHighlight),
    )
    section.hidden = false
  }

  return {
    applySnapshot: render,
    setDisconnected: () => {
      renderEmptyListState(
        highlightsEl,
        'duty-highlights-empty',
        UI_TEXT.connectionLost,
      )
    },
  }
}
