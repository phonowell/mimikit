import { buildTaskArchiveViewerUrl } from '../../webui/archive-viewer-url.js'
import { formatDisplayTimeWithFull } from '../../webui/messages/format-time.js'
import { UI_TEXT } from '../../webui/system-text.js'

import { ModalDialog } from './ModalDialog.js'

import type { FocusView } from '../types.js'

type Props = {
  open: boolean
  focuses: FocusView[]
  onClose: () => void
}

export const FocusDialog = ({ open, focuses, onClose }: Props) => (
  <ModalDialog
    open={open}
    className="focuses-dialog"
    id="focuses-dialog"
    labelledBy="focuses-title"
    onClose={onClose}
    title={null}
  >
    <section className="focuses-panel">
      <header className="focuses-header">
        <h2 className="focuses-title" id="focuses-title">
          Focus
        </h2>
        <div className="focuses-actions" role="group" aria-label="Focus">
          <button
            className="btn btn--icon btn--icon-muted focuses-close"
            type="button"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </header>
      <ul className="focuses-list scrollable">
        {focuses.length === 0 ? (
          <li className="list-empty focuses-empty">{UI_TEXT.noFocuses}</li>
        ) : null}
        {focuses.map((focus) => {
          const changedAt = focus.lastActivityAt || focus.updatedAt
          const timeDisplay = formatDisplayTimeWithFull(changedAt)
          const body = (
            <>
              <div className="focus-title-row">
                <span
                  className="focus-status"
                  data-status={focus.status}
                ></span>
                <span className="focus-title">
                  {focus.title?.trim() || focus.id || UI_TEXT.untitledTask}
                </span>
              </div>
              {focus.summary ? (
                <p className="focus-summary">{focus.summary}</p>
              ) : null}
              {focus.openItems && focus.openItems.length > 0 ? (
                <>
                  <p className="focus-open-items-title">
                    {UI_TEXT.focusOpenItemsLabel}
                  </p>
                  <ul className="focus-open-items">
                    {focus.openItems.map((item, index) => (
                      <li
                        key={`${focus.id}-item-${index}`}
                        className="focus-open-item"
                      >
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
            <li
              key={focus.id}
              className="focus-item"
              data-status={focus.status}
            >
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
        })}
      </ul>
    </section>
  </ModalDialog>
)
