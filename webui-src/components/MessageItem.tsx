import { renderMarkdownHtml } from '../lib/markdown.js'
import {
  getMessageArtifacts,
  getMessageLocalPathsToSkip,
} from '../lib/messages.js'
import {
  formatQuotePreview,
  formatRoleLabel,
  normalizeRole,
} from '../lib/messages/quote-utils.js'
import { UI_TEXT } from '../lib/system-text.js'

import { MessageMeta } from './MessageMeta.js'

import type { ChatMessage } from '../types.js'

type Props = {
  deleteMode: boolean
  message: ChatMessage
  onDelete: (message: ChatMessage) => void
  onQuote: (message: ChatMessage) => void
  quotedMessage: ChatMessage | undefined
}

export const MessageItem = ({
  deleteMode,
  message,
  onDelete,
  onQuote,
  quotedMessage,
}: Props) => {
  const isSystem = message.role === 'system'
  const canQuote = !deleteMode && !isSystem && !!message.id
  const canDelete = deleteMode && !isSystem && !!message.id
  const isAgent = message.role === 'agent'
  const artifacts = getMessageArtifacts(message)
  const skipLocalPaths = getMessageLocalPathsToSkip(message)

  return (
    <li
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
          className={`content${isAgent ? ' markdown' : ''}`}
          {...(isAgent
            ? {
                dangerouslySetInnerHTML: {
                  __html: renderMarkdownHtml(message.text ?? '', {
                    skipLocalPaths,
                  }),
                },
              }
            : { children: message.text ?? '' })}
        ></div>
        {artifacts.length > 0 ? (
          <div className="message-artifacts" aria-label="Local files">
            {artifacts.map((artifact) => (
              <a
                key={`${artifact.href}:${artifact.label}`}
                className="message-artifact"
                href={artifact.href}
                target="_blank"
                rel="noopener noreferrer"
                title={
                  artifact.note
                    ? `${artifact.note}: ${artifact.path}`
                    : artifact.path
                }
              >
                {artifact.note
                  ? `${artifact.note}: ${artifact.label}`
                  : artifact.label}
              </a>
            ))}
          </div>
        ) : null}
        <MessageMeta message={message} />
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
