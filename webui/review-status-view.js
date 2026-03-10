import { UI_TEXT } from './system-text.js'

export const EMPTY_REVIEW_STATUS = {
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

export const normalizeReviewStatus = (value) => {
  if (!value || typeof value !== 'object') return EMPTY_REVIEW_STATUS
  return {
    cards: normalizeCards(value.cards),
    highlights: normalizeHighlights(value.highlights),
  }
}

export const resolveReviewStatusCardValue = (cards, id) =>
  cards.find((item) => item.id === id)?.value ?? 0

export const resolveReviewStatusSummary = (reviewStatus) => {
  const nonZeroCards = reviewStatus.cards.filter((item) => item.value > 0)
  if (nonZeroCards.length > 0)
    {return nonZeroCards
      .slice(0, 2)
      .map((item) => `${item.label} ${item.value}`)
      .join(' · ')}
  return reviewStatus.highlights.length > 0
    ? `Review items ${reviewStatus.highlights.length}`
    : UI_TEXT.noReviewStatus
}

export const renderReviewStatusCard = (item) => {
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

export const renderReviewStatusHighlight = (item) => {
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
