import { useEffectEvent, useLayoutEffect, useRef } from 'react'

import type { QuoteState } from '../types.js'

type Props = {
  hasQuote: boolean
  isNearBottom: boolean
  onChange: (value: string) => void
  onClearQuote: () => void
  onLayoutShift: (stickToBottom: boolean) => void
  onSubmit: () => void
  value: string
  sendPending: boolean
  quoteLabel: string
  quoteText: string
  quoteRole: QuoteState['role']
}

export const buildQuotePreviewState = (
  hasQuote: boolean,
  quoteRole: QuoteState['role'],
) => ({
  className: `quote-preview${hasQuote ? ' is-visible' : ''}`,
  dataRole: quoteRole,
})

const resizeInput = (input: HTMLTextAreaElement) => {
  input.style.height = 'auto'
  const computed = window.getComputedStyle(input)
  const borderTop = Number.parseFloat(computed.borderTopWidth) || 0
  const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0
  const maxHeight = Number.parseFloat(computed.maxHeight) || 0
  const nextHeight = input.scrollHeight + borderTop + borderBottom
  input.style.height = `${maxHeight > 0 ? Math.min(nextHeight, maxHeight) : nextHeight}px`
  input.style.overflowY =
    maxHeight > 0 && nextHeight > maxHeight ? 'auto' : 'hidden'
}

export const Composer = ({
  hasQuote,
  isNearBottom,
  onChange,
  onClearQuote,
  onLayoutShift,
  onSubmit,
  quoteLabel,
  quoteRole,
  quoteText,
  sendPending,
  value,
}: Props) => {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const syncLayoutShift = useEffectEvent(onLayoutShift)

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    resizeInput(input)
    syncLayoutShift(isNearBottom)
  }, [hasQuote, isNearBottom, syncLayoutShift, value])

  const quotePreview = buildQuotePreviewState(hasQuote, quoteRole)

  return (
    <section className="composer" aria-label="Input">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <div
          className={quotePreview.className}
          data-role={quotePreview.dataRole}
          hidden={!hasQuote}
        >
          <span className="quote-label">{quoteLabel}</span>
          <span className="quote-text">{quoteText}</span>
          <button
            className="btn btn--icon btn--icon-muted quote-clear"
            type="button"
            onClick={onClearQuote}
          >
            &times;
          </button>
        </div>
        <label className="visually-hidden" htmlFor="message-input">
          Message
        </label>
        <textarea
          id="message-input"
          ref={inputRef}
          placeholder="Message..."
          rows={1}
          disabled={sendPending}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              onSubmit()
            }
          }}
        ></textarea>
        <button
          className="btn btn--md btn--primary"
          type="submit"
          disabled={sendPending}
        >
          Send
        </button>
      </form>
    </section>
  )
}
