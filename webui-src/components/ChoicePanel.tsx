import { memo } from 'react'

import {
  formatChoiceRemaining,
  resolveChoiceDefaultLabel,
} from '../lib/choice-payload.js'
import { UI_TEXT } from '../lib/system-text.js'

import type { ChoiceView } from '../types.js'

type Props = {
  choices: ChoiceView[]
  pendingChoiceId: string
  pendingOptionId: string
  choiceMetaOverrides: ReadonlyMap<string, string>
  disconnected: boolean
  onSelect: (choiceId: string, optionId: string) => void
}

const resolveMeta = (
  choice: ChoiceView,
  disconnected: boolean,
  overrides: ReadonlyMap<string, string>,
): string => {
  const override = overrides.get(choice.id)
  if (override) return override
  if (disconnected) return UI_TEXT.connectionLost
  const remaining = formatChoiceRemaining(choice.expiresAt)
  const defaultLabel = resolveChoiceDefaultLabel(choice)
  return remaining
    ? `${UI_TEXT.choiceDefaultIn} ${remaining} · ${UI_TEXT.choiceDefaultOption} ${defaultLabel}`
    : `${UI_TEXT.choiceDefaultOption} ${defaultLabel}`
}

export const ChoicePanel = memo(function ChoicePanel({
  choices,
  pendingChoiceId,
  pendingOptionId,
  choiceMetaOverrides,
  disconnected,
  onSelect,
}: Props) {
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
                const isPending = pendingChoiceId === choice.id
                const isSelected = isPending && pendingOptionId === option.id
                const isDefault = option.id === choice.defaultOptionId
                return (
                  <button
                    key={option.id}
                    className="choice-tab"
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    disabled={isPending}
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
              {resolveMeta(choice, disconnected, choiceMetaOverrides)}
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
})
