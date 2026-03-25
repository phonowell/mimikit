import { memo } from 'react'

import { useNowTick } from '../hooks/use-now-tick.js'
import { formatDisplayTimeWithFull } from '../lib/messages/format-time.js'
import {
  formatElapsedLabel,
  formatUsage,
} from '../lib/messages/format-usage.js'
import { shouldDisplayMessageTime } from '../lib/messages.js'

import type { ChatMessage } from '../types.js'

type Props = {
  message: ChatMessage
}

const isAgentMessage = (message: ChatMessage): boolean =>
  message.role === 'agent'

export const MessageMeta = memo(function MessageMeta({ message }: Props) {
  const shouldTick = shouldDisplayMessageTime(message)
  const now = useNowTick(60_000, shouldTick)
  const usage = isAgentMessage(message) ? formatUsage(message.usage) : null
  const elapsed = isAgentMessage(message)
    ? formatElapsedLabel(message.elapsedMs)
    : ''
  const timeDisplay = shouldTick
    ? formatDisplayTimeWithFull(message.createdAt, { now })
    : { displayText: '', fullText: '' }

  if (!usage?.text && !elapsed && !timeDisplay.displayText) return null

  return (
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
  )
})
