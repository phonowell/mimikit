import { buildTaskArchiveViewerUrl } from '../../webui/archive-viewer-url.js'
import { formatDisplayTimeWithFull } from '../../webui/messages/format-time.js'
import { UI_TEXT } from '../../webui/system-text.js'

import { ModalDialog } from './ModalDialog.js'

import type { PlanView } from '../types.js'

type Props = {
  open: boolean
  plans: PlanView[]
  onClose: () => void
}

export const PlansDialog = ({ open, plans, onClose }: Props) => (
  <ModalDialog
    open={open}
    className="plans-dialog"
    id="plans-dialog"
    labelledBy="plans-title"
    onClose={onClose}
    title={null}
  >
    <section className="plans-panel">
      <header className="plans-header">
        <h2 className="plans-title" id="plans-title">
          Plans
        </h2>
        <div className="plans-actions" role="group" aria-label="Plans">
          <button
            className="btn btn--icon btn--icon-muted plans-close"
            type="button"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </header>
      <ul className="plans-list scrollable">
        {plans.length === 0 ? (
          <li className="list-empty plans-empty">{UI_TEXT.noPlans}</li>
        ) : null}
        {plans.map((plan, index) => {
          const changedAt = plan.archivedAt || plan.updatedAt || ''
          const timeDisplay = formatDisplayTimeWithFull(changedAt)
          const trigger =
            plan.trigger?.mode === 'cron'
              ? `cron:${plan.trigger.cron ?? ''}`
              : plan.trigger?.mode === 'scheduled_at'
                ? formatDisplayTimeWithFull(plan.trigger.scheduledAt, {
                    relative: false,
                    calendarWords: true,
                  }).displayText
                : plan.trigger?.mode === 'on_worker_slot_freed'
                  ? 'slot-freed'
                  : ''
          const body = (
            <>
              <div className="plan-title-row">
                <span
                  className="plan-status"
                  data-status={plan.status ?? 'active'}
                ></span>
                <span className="plan-title">
                  {plan.title?.trim() || UI_TEXT.untitledTask}
                </span>
              </div>
              <small className="plan-meta">
                {trigger ? (
                  <span className="plan-trigger">{trigger}</span>
                ) : null}
                {timeDisplay.displayText ? (
                  <span
                    className="plan-time"
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
              key={plan.id ?? `plan-${index}`}
              className="plan-item"
              data-status={plan.status ?? 'active'}
            >
              {plan.lastTaskId ? (
                <a
                  className="plan-link"
                  href={buildTaskArchiveViewerUrl(plan.lastTaskId)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {body}
                </a>
              ) : (
                <div className="plan-link">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  </ModalDialog>
)
