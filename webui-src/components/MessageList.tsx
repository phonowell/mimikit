import { UI_TEXT } from '../../webui/system-text.js'

import { MessageItem } from './MessageItem.js'

import type { ChatMessage } from '../types.js'

type Props = {
  messages: ChatMessage[]
  loading: boolean
  deleteMode: boolean
  scrollButtonVisible: boolean
  onScroll: () => void
  onScrollBottom: () => void
  onQuote: (message: ChatMessage) => void
  onDelete: (message: ChatMessage) => void
}

export const MessageList = ({
  messages,
  loading,
  deleteMode,
  scrollButtonVisible,
  onScroll,
  onScrollBottom,
  onQuote,
  onDelete,
}: Props) => (
  <section className="messages-section" aria-label="Chat">
    <h2 className="visually-hidden">Chat</h2>
    <ul
      className="messages scrollable"
      data-messages
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-atomic="false"
      onScroll={onScroll}
    >
      {messages.map((message, index) => (
        <MessageItem
          key={message.id ?? `message-${index}`}
          deleteMode={deleteMode}
          index={index}
          message={message}
          messages={messages}
          onDelete={onDelete}
          onQuote={onQuote}
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
