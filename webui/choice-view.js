import {
  formatChoiceRemaining,
  resolveChoiceDefaultLabel,
} from './choice-payload.js'
import { UI_TEXT } from './system-text.js'

export const updateChoiceMeta = (metaEl, choices) => {
  if (!(metaEl instanceof HTMLElement)) return
  if (choices.length === 0) {
    metaEl.textContent = ''
    return
  }
  metaEl.textContent =
    choices.length === 1
      ? '1 pending confirmation'
      : `${choices.length} pending confirmations`
}

const buildChoiceMeta = ({
  choice,
  disconnected,
  metaOverrideByChoiceId,
}) => {
  const override = metaOverrideByChoiceId.get(choice.id)
  if (override) return override
  if (disconnected) return UI_TEXT.connectionLost
  const remaining = formatChoiceRemaining(choice.expiresAt)
  const defaultLabel = resolveChoiceDefaultLabel(choice)
  return remaining
    ? `${UI_TEXT.choiceDefaultIn} ${remaining} · ${UI_TEXT.choiceDefaultOption} ${defaultLabel}`
    : `${UI_TEXT.choiceDefaultOption} ${defaultLabel}`
}

const createChoiceOptionButton = ({
  choice,
  option,
  pendingChoiceId,
  pendingOptionId,
  requestSelect,
}) => {
  const isDefaultOption = option.id === choice.defaultOptionId
  const isPendingChoice = pendingChoiceId === choice.id
  const isSelectedOption = isPendingChoice && pendingOptionId === option.id
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'choice-tab'
  button.setAttribute('role', 'tab')
  button.setAttribute('aria-selected', isSelectedOption ? 'true' : 'false')
  if (isDefaultOption) {
    button.setAttribute(
      'aria-label',
      `${option.label} (${UI_TEXT.choiceDefaultBadge})`,
    )
  }
  if (isPendingChoice) button.disabled = true
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
    badge.textContent = UI_TEXT.choiceDefaultBadge
    label.appendChild(badge)
  }
  const reason = document.createElement('span')
  reason.className = 'choice-tab-reason'
  reason.textContent = option.reason
  button.appendChild(label)
  button.appendChild(reason)
  button.addEventListener('click', () => {
    if (pendingChoiceId === choice.id) return
    void requestSelect(choice.id, option.id)
  })
  return button
}

const createChoiceCard = ({
  choice,
  showQuestion,
  pendingChoiceId,
  pendingOptionId,
  disconnected,
  metaOverrideByChoiceId,
  requestSelect,
}) => {
  const card = document.createElement('section')
  card.className = 'choice-card'

  if (showQuestion) {
    const cardQuestion = document.createElement('p')
    cardQuestion.className = 'choice-card-question'
    cardQuestion.textContent = choice.question
    card.appendChild(cardQuestion)
  }

  const choiceOptions = document.createElement('div')
  choiceOptions.className = 'choice-card-options'
  for (const option of choice.options) {
    choiceOptions.appendChild(
      createChoiceOptionButton({
        choice,
        option,
        pendingChoiceId,
        pendingOptionId,
        requestSelect,
      }),
    )
  }
  card.appendChild(choiceOptions)

  const cardMeta = document.createElement('p')
  cardMeta.className = 'choice-card-meta'
  cardMeta.textContent = buildChoiceMeta({
    choice,
    disconnected,
    metaOverrideByChoiceId,
  })
  card.appendChild(cardMeta)

  return card
}

export const renderChoiceCards = ({
  optionsEl,
  choices,
  pendingChoiceId,
  pendingOptionId,
  disconnected,
  metaOverrideByChoiceId,
  requestSelect,
}) => {
  if (!(optionsEl instanceof HTMLElement)) return
  optionsEl.replaceChildren()
  const showQuestion = choices.length > 1
  for (const choice of choices) {
    optionsEl.appendChild(
      createChoiceCard({
        choice,
        showQuestion,
        pendingChoiceId,
        pendingOptionId,
        disconnected,
        metaOverrideByChoiceId,
        requestSelect,
      }),
    )
  }
}

export const resolveChoiceQuestionText = (choices) =>
  choices.length === 1 ? choices[0].question : `${choices.length} pending confirmations`
