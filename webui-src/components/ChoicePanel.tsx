import {
  formatChoiceRemaining,
  resolveChoiceDefaultLabel,
} from '../lib/choice-payload.js'
import { UI_TEXT } from '../lib/system-text.js'

import type { ChoiceSubmissionState } from '../hooks/use-app-actions-types.js'
import type { ChoiceView } from '../types.js'

type Props = {
  choices: ChoiceView[]
  choiceSubmission: ChoiceSubmissionState
  isDisconnected: boolean
  onSelect: (choiceId: string, optionId: string) => void
}

const resolveMeta = (
  choice: ChoiceView,
  isDisconnected: boolean,
  submission: ChoiceSubmissionState,
): string => {
  if (submission?.choiceId === choice.id) {
    if (submission.status === 'submitting') return UI_TEXT.choiceSubmitting
    if (submission.status === 'submitted') return UI_TEXT.choiceSubmitted
    return `${UI_TEXT.choiceSelectFailed}: ${submission.message ?? ''}`.trim()
  }
  if (isDisconnected) return UI_TEXT.connectionLost
  const remaining = formatChoiceRemaining(choice.expiresAt)
  const defaultLabel = resolveChoiceDefaultLabel(choice)
  return remaining
    ? `${UI_TEXT.choiceDefaultIn} ${remaining} · ${UI_TEXT.choiceDefaultOption} ${defaultLabel}`
    : `${UI_TEXT.choiceDefaultOption} ${defaultLabel}`
}

export const ChoicePanel = ({
  choices,
  choiceSubmission,
  isDisconnected,
  onSelect,
}: Props) => {
  if (choices.length === 0) return null
  return (
    <section
      className="choice-panel"
      aria-live="polite"
      aria-label="Pending confirmations"
    >
      <p className="choice-question">
        {choices.length === 1
          ? choices[0]?.question
          : `${choices.length} pending confirmations`}
      </p>
      <div className="choice-options" role="tablist">
        {choices.map((choice) => (
          <section key={choice.id} className="choice-card">
            {choices.length > 1 ? (
              <p className="choice-card-question">{choice.question}</p>
            ) : null}
            <div className="choice-card-options">
              {choice.options.map((option) => {
                const isLocked =
                  choiceSubmission?.choiceId === choice.id &&
                  choiceSubmission.status !== 'error'
                const isSelected =
                  isLocked && choiceSubmission.optionId === option.id
                const isDefault = option.id === choice.defaultOptionId
                return (
                  <button
                    key={option.id}
                    className="choice-tab"
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    disabled={isLocked}
                    onClick={() => onSelect(choice.id, option.id)}
                  >
                    <span className="choice-tab-label">
                      <span className="choice-tab-label-text">
                        {option.label}
                      </span>
                      {isDefault ? (
                        <span className="choice-tab-badge">
                          {UI_TEXT.choiceDefaultBadge}
                        </span>
                      ) : null}
                    </span>
                    <span className="choice-tab-reason">{option.reason}</span>
                  </button>
                )
              })}
            </div>
            <p className="choice-card-meta">
              {resolveMeta(choice, isDisconnected, choiceSubmission)}
            </p>
          </section>
        ))}
      </div>
      <p className="choice-meta">
        {choices.length === 1
          ? '1 pending confirmation'
          : `${choices.length} pending confirmations`}
      </p>
    </section>
  )
}
