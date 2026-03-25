import { UI_TEXT } from '../lib/system-text.js'

import { MessageItem } from './MessageItem.js'

import type { ChatMessage } from '../types.js'
import type { RefObject } from 'react'

type Props = {
  messages: ChatMessage[]
  loading: boolean
  deleteMode: boolean
  listRef: RefObject<HTMLUListElement | null>
  scrollButtonVisible: boolean
  onScrollBottom: () => void
  onQuote: (message: ChatMessage) => void
  onDelete: (message: ChatMessage) => void
}

const indexMessagesById = (
  messages: readonly ChatMessage[],
): ReadonlyMap<string, ChatMessage> => {
  const index = new Map<string, ChatMessage>()
  for (const message of messages) if (message.id) index.set(message.id, message)

  return index
}

export const MessageList = ({
  messages,
  loading,
  deleteMode,
  listRef,
  scrollButtonVisible,
  onScrollBottom,
  onQuote,
  onDelete,
}: Props) => {
  const messagesById = indexMessagesById(messages)

  return (
    <section className="messages-section" aria-label="Chat">
      <h2 className="visually-hidden">Chat</h2>
      <ul
        className="messages scrollable"
        data-messages
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
      >
        {messages.map((message, index) => (
          <MessageItem
            key={message.id ?? `message-${index}`}
            deleteMode={deleteMode}
            message={message}
            onDelete={onDelete}
            onQuote={onQuote}
            quotedMessage={
              message.quote ? messagesById.get(message.quote) : undefined
            }
          />
        ))}
        {loading ? (
          <li className="message agent message-loading">
            <article>
              <div
                className="content loading-dots"
                role="status"
                aria-label={UI_TEXT.loadingAriaLabel}
              >
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            </article>
          </li>
        ) : null}
      </ul>
      <button
        className={`btn btn--icon btn--icon-lg scroll-bottom${scrollButtonVisible ? ' is-visible' : ''}`}
        type="button"
        title="Scroll down"
        aria-label="Scroll down"
        aria-hidden={!scrollButtonVisible}
        tabIndex={scrollButtonVisible ? 0 : -1}
        onClick={onScrollBottom}
      >
        ↓
      </button>
    </section>
  )
}
