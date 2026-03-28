type Props = {
  statusText: string
  statusState: string
  workerStates: string[]
  hasPlans: boolean
  toolsMenuOpen: boolean
  toolsDisabled: boolean
  onOpenPlans: () => void
  onOpenTasks: () => void
  onPreloadPlans: () => void
  onPreloadTasks: () => void
  onToggleTools: () => void
  onToggleDeleteMode: () => void
  onOpenRestart: () => void
  onOpenReset: () => void
}

export const Header = ({
  statusText,
  statusState,
  workerStates,
  hasPlans,
  toolsMenuOpen,
  toolsDisabled,
  onOpenPlans,
  onOpenTasks,
  onPreloadPlans,
  onPreloadTasks,
  onToggleTools,
  onToggleDeleteMode,
  onOpenRestart,
  onOpenReset,
}: Props) => (
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
          className="btn btn--sm plans-open"
          hidden={!hasPlans}
          type="button"
          title="Plans"
          aria-label="Plans"
          aria-haspopup="dialog"
          aria-controls="plans-dialog"
          onFocus={onPreloadPlans}
          onMouseEnter={onPreloadPlans}
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
          onFocus={onPreloadTasks}
          onMouseEnter={onPreloadTasks}
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
