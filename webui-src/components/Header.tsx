import { memo } from 'react'

type Props = {
  statusText: string
  statusState: string
  workerStates: string[]
  hasPlans: boolean
  toolsMenuOpen: boolean
  ttsLabel: string
  toolsDisabled: boolean
  onOpenFocuses: () => void
  onOpenPlans: () => void
  onOpenTasks: () => void
  onToggleTools: () => void
  onToggleTts: () => void
  onToggleDeleteMode: () => void
  onOpenRestart: () => void
  onOpenReset: () => void
}

export const Header = memo(function Header({
  statusText,
  statusState,
  workerStates,
  hasPlans,
  toolsMenuOpen,
  ttsLabel,
  toolsDisabled,
  onOpenFocuses,
  onOpenPlans,
  onOpenTasks,
  onToggleTools,
  onToggleTts,
  onToggleDeleteMode,
  onOpenRestart,
  onOpenReset,
}: Props) {
  return (
    <header className="app-header">
      <div className="app-controls" role="group" aria-label="Top controls">
        <div className="status-group" aria-label="Status">
          <p className="status-item">
            <span className="status-dot" data-state={statusState}></span>
            <span className="status-text" aria-live="polite">
              {statusText}
            </span>
          </p>
        </div>
        <div className="app-actions" role="toolbar" aria-label="Controls">
          <button
            className="btn btn--sm focuses-open"
            type="button"
            title="Focus"
            aria-label="Focus"
            aria-haspopup="dialog"
            aria-controls="focuses-dialog"
            onClick={onOpenFocuses}
          >
            <span className="focuses-label">Focus</span>
          </button>
          <button
            className="btn btn--sm plans-open"
            hidden={!hasPlans}
            type="button"
            title="Plans"
            aria-label="Plans"
            aria-haspopup="dialog"
            aria-controls="plans-dialog"
            onClick={onOpenPlans}
          >
            <span className="plans-label">Plans</span>
          </button>
          <button
            className="btn btn--sm tasks-open"
            type="button"
            title="Tasks"
            aria-label="Tasks"
            aria-haspopup="dialog"
            aria-controls="tasks-dialog"
            onClick={onOpenTasks}
          >
            <span className="tasks-label">Tasks</span>
            <span className="tasks-worker-dots" aria-hidden="true">
              {workerStates.map((state, index) => (
                <span
                  key={index}
                  className="worker-dot"
                  data-state={state}
                ></span>
              ))}
            </span>
          </button>
          <div className="tools-menu-wrap">
            <button
              className="btn btn--sm tools-toggle"
              type="button"
              title="Tools"
              aria-label="Tools"
              aria-haspopup="menu"
              aria-controls="tools-menu"
              aria-expanded={toolsMenuOpen}
              disabled={toolsDisabled}
              onClick={onToggleTools}
            >
              Tools
            </button>
            <div
              className="tools-menu"
              id="tools-menu"
              role="menu"
              hidden={!toolsMenuOpen}
            >
              <button
                className="tools-menu-item"
                type="button"
                role="menuitemcheckbox"
                aria-checked={ttsLabel.endsWith('on') ? 'true' : 'false'}
                onClick={onToggleTts}
              >
                {ttsLabel}
              </button>
              <button
                className="tools-menu-item"
                type="button"
                role="menuitem"
                onClick={onToggleDeleteMode}
              >
                Delete messages
              </button>
              <button
                className="tools-menu-item tools-menu-item--danger"
                type="button"
                role="menuitem"
                onClick={onOpenReset}
              >
                Reset
              </button>
              <button
                className="tools-menu-item"
                type="button"
                role="menuitem"
                onClick={onOpenRestart}
              >
                Restart
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
})
