import { formatDisplayTimeWithFull } from '../../webui/messages/format-time.js'
import {
  formatElapsedLabel,
  formatUsage,
} from '../../webui/messages/format-usage.js'
import {
  formatQuotePreview,
  formatRoleLabel,
  normalizeRole,
} from '../../webui/messages/quote-utils.js'
import { UI_TEXT } from '../../webui/system-text.js'
import { renderMarkdownHtml } from '../lib/markdown.js'

import type { ChatMessage } from '../types.js'

type Props = {
  deleteMode: boolean
  index: number
  message: ChatMessage
  messages: readonly ChatMessage[]
  onDelete: (message: ChatMessage) => void
  onQuote: (message: ChatMessage) => void
}

const isAgentMessage = (message: ChatMessage): boolean =>
  message.role === 'agent'

const resolveQuote = (
  messages: readonly ChatMessage[],
  quoteId: string | undefined,
): ChatMessage | undefined =>
  messages.find((item) => item.id && quoteId && item.id === quoteId)

export const MessageItem = ({
  deleteMode,
  index,
  message,
  messages,
  onDelete,
  onQuote,
}: Props) => {
  const isSystem = message.role === 'system'
  const canQuote = !deleteMode && !isSystem && !!message.id
  const canDelete = deleteMode && !isSystem && !!message.id
  const quotedMessage = resolveQuote(messages, message.quote)
  const usage = isAgentMessage(message) ? formatUsage(message.usage) : null
  const elapsed = isAgentMessage(message)
    ? formatElapsedLabel(message.elapsedMs)
    : ''
  const timeDisplay = formatDisplayTimeWithFull(message.createdAt)

  return (
    <li
      key={message.id ?? `message-${index}`}
      className={`message ${message.role === 'agent' ? 'agent' : message.role}${canQuote ? ' message--quoteable' : ''}`}
      {...(message.id ? { 'data-message-id': message.id } : {})}
      tabIndex={canQuote ? 0 : undefined}
    >
      <article
        onDoubleClick={() => {
          if (!canQuote || window.matchMedia('(max-width: 640px)').matches)
            return
          onQuote(message)
        }}
      >
        {message.quote ? (
          <button
            type="button"
            className="message-quote"
            data-quote-role={normalizeRole(quotedMessage?.role)}
            data-quote-id={message.quote}
            disabled={!quotedMessage?.id}
            onClick={() => {
              if (!quotedMessage?.id) return
              document
                .querySelector(
                  `[data-message-id="${CSS.escape(quotedMessage.id)}"]`,
                )
                ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
            }}
          >
            <span className="message-quote-author">
              {quotedMessage
                ? formatRoleLabel(quotedMessage.role)
                : UI_TEXT.quoteUnknown}
            </span>
            <span className="message-quote-text">
              {quotedMessage
                ? formatQuotePreview(quotedMessage.text) ||
                  UI_TEXT.quoteFallbackMessage
                : UI_TEXT.quoteMissingMessage}
            </span>
          </button>
        ) : null}
        <div
          className={`content${isAgentMessage(message) ? ' markdown' : ''}`}
          {...(isAgentMessage(message)
            ? {
                dangerouslySetInnerHTML: {
                  __html: renderMarkdownHtml(message.text ?? ''),
                },
              }
            : { children: message.text ?? '' })}
        ></div>
        {usage?.text || elapsed || timeDisplay.displayText ? (
          <small className="meta">
            {usage?.text ? (
              <span className="usage" title={usage.title}>
                {usage.text}
              </span>
            ) : null}
            {elapsed ? (
              <span className="elapsed">
                {usage?.text ? `· ${elapsed}` : elapsed}
              </span>
            ) : null}
            {timeDisplay.displayText ? (
              <span
                className="time"
                title={timeDisplay.fullText || message.createdAt || ''}
              >
                {timeDisplay.displayText}
              </span>
            ) : null}
          </small>
        ) : null}
      </article>
      {canQuote ? (
        <button
          className="btn btn--xs message-quote-btn"
          type="button"
          title={UI_TEXT.quote}
          aria-label={UI_TEXT.quote}
          onClick={() => onQuote(message)}
        >
          {message.role === 'user' ? '↪' : '↩'}
        </button>
      ) : null}
      {canDelete ? (
        <button
          className="btn btn--xs message-delete-btn"
          type="button"
          title={UI_TEXT.delete}
          aria-label={UI_TEXT.delete}
          onClick={() => onDelete(message)}
        >
          ✕
        </button>
      ) : null}
    </li>
  )
}
