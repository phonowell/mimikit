import { useNowTick } from '../hooks/use-now-tick.js'
import { buildTaskArchiveViewerUrl } from '../lib/archive-viewer-url.js'
import { formatDisplayTimeWithFull } from '../lib/messages/format-time.js'
import { UI_TEXT } from '../lib/system-text.js'

import type { FocusView } from '../types.js'

type Props = {
  focus: FocusView
  open: boolean
}

export const FocusListItem = ({ focus, open }: Props) => {
  const now = useNowTick(60_000, open)
  const changedAt = focus.lastActivityAt || focus.updatedAt
  const timeDisplay = formatDisplayTimeWithFull(changedAt, { now })
  const body = (
    <>
      <div className="focus-title-row">
        <span className="focus-status" data-status={focus.status}></span>
        <span className="focus-title">
          {focus.title?.trim() || focus.id || UI_TEXT.untitledTask}
        </span>
      </div>
      {focus.summary ? <p className="focus-summary">{focus.summary}</p> : null}
      {focus.openItems && focus.openItems.length > 0 ? (
        <>
          <p className="focus-open-items-title">
            {UI_TEXT.focusOpenItemsLabel}
          </p>
          <ul className="focus-open-items">
            {focus.openItems.map((item, index) => (
              <li key={`${focus.id}-item-${index}`} className="focus-open-item">
                {item}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <small className="focus-meta">
        {timeDisplay.displayText ? (
          <span
            className="focus-time"
            title={timeDisplay.fullText || changedAt}
          >
            {timeDisplay.displayText}
          </span>
        ) : null}
      </small>
    </>
  )

  return (
    <li className="focus-item" data-status={focus.status}>
      {focus.lastTaskId ? (
        <a
          className="focus-link"
          href={buildTaskArchiveViewerUrl(focus.lastTaskId)}
          target="_blank"
          rel="noreferrer"
        >
          {body}
        </a>
      ) : (
        <div className="focus-link">{body}</div>
      )}
    </li>
  )
}
