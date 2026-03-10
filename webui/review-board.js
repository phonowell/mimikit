import { bindDialogControls, createDialogController } from './dialog.js'
import { fetchWithTimeout } from './fetch-with-timeout.js'
import { renderEmptyListState } from './list-empty.js'
import {
  EMPTY_REVIEW_STATUS,
  normalizeReviewStatus,
  renderReviewStatusCard,
  renderReviewStatusHighlight,
  resolveReviewStatusCardValue,
  resolveReviewStatusSummary,
} from './review-status-view.js'
import { UI_TEXT } from './system-text.js'

const EMPTY_PANEL = {
  applySnapshot: () => {},
  setDisconnected: () => {},
  dispose: () => {},
}
const REVIEW_BOARD_REQUEST_TIMEOUT_MS = 15000

export const bindReviewStatusPanel = ({
  dialog,
  openBtn,
  closeBtn,
  summaryEl,
  cardsEl,
  actionsEl,
  highlightsEl,
}) => {
  if (
    !(dialog instanceof HTMLElement) ||
    !(openBtn instanceof HTMLElement) ||
    !(closeBtn instanceof HTMLElement) ||
    !(cardsEl instanceof HTMLElement) ||
    !(actionsEl instanceof HTMLElement) ||
    !(highlightsEl instanceof HTMLElement)
  )
    return EMPTY_PANEL

  let currentReviewStatus = EMPTY_REVIEW_STATUS
  let actionBusy = false
  let actionNote = ''

  const updateSummary = (summaryOverride = '') => {
    const summary = summaryOverride || resolveReviewStatusSummary(currentReviewStatus)
    if (summaryEl instanceof HTMLElement) summaryEl.textContent = summary
    openBtn.setAttribute('title', `Review status · ${summary}`)
    openBtn.setAttribute('aria-label', `Review status. ${summary}`)
  }

  const renderActions = () => {
    actionsEl.replaceChildren()
    const recoverableCount = resolveReviewStatusCardValue(
      currentReviewStatus.cards,
      'recoverable',
    )
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

    if (!actionNote) return
    const note = document.createElement('p')
    note.className = 'review-action-note'
    note.textContent = actionNote
    actionsEl.appendChild(note)
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
    currentReviewStatus = normalizeReviewStatus(payload)
    cardsEl.replaceChildren(...currentReviewStatus.cards.map(renderReviewStatusCard))
    renderActions()
    updateSummary()
    if (currentReviewStatus.highlights.length === 0) {
      renderEmptyListState(
        highlightsEl,
        'review-highlights-empty',
        UI_TEXT.noReviewStatus,
      )
      return
    }
    highlightsEl.replaceChildren(
      ...currentReviewStatus.highlights.map(renderReviewStatusHighlight),
    )
  }

  const controller = createDialogController({
    dialog,
    trigger: openBtn,
    focusOnOpen: closeBtn,
    focusOnClose: openBtn,
  })
  controller.setExpanded(false)
  const unbindDialogControls = bindDialogControls({
    dialog,
    openBtn,
    closeBtn,
    controller,
  })

  render(null)

  return {
    applySnapshot: render,
    setDisconnected: () => {
      currentReviewStatus = EMPTY_REVIEW_STATUS
      actionBusy = false
      actionNote = UI_TEXT.connectionLost
      cardsEl.replaceChildren()
      renderActions()
      updateSummary(UI_TEXT.connectionLost)
      renderEmptyListState(
        highlightsEl,
        'review-highlights-empty',
        UI_TEXT.connectionLost,
      )
    },
    dispose: () => {
      unbindDialogControls()
    },
  }
}
