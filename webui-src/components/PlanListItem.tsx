import { useId, useRef } from 'react'

import { useNowTick } from '../hooks/use-now-tick.js'
import { buildTaskArchiveViewerUrl } from '../lib/archive-viewer-url.js'
import {
  formatDisplayTimeWithFull,
  getDisplayTimeTickMs,
} from '../lib/messages/format-time.js'
import { UI_TEXT } from '../lib/system-text.js'

import { PlanActionMenu } from './PlanActionMenu.js'
import { PlanListItemProgress } from './PlanListItemProgress.js'
import { PlanListItemStage } from './PlanListItemStage.js'

import type { PlanView } from '../types.js'

type Props = {
  open: boolean
  onPlanAction: (planId: string, action: 'copy-id') => void
  onToggleMenu: (planId: string) => void
  openMenuId: string
  plan: PlanView
}

export const PlanListItem = ({
  open,
  onPlanAction,
  onToggleMenu,
  openMenuId,
  plan,
}: Props) => {
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const planId = plan.id?.trim() || ''
  const menuOpen = Boolean(planId) && openMenuId === planId
  const changedAt = plan.archivedAt || plan.updatedAt || ''
  const tickMs = Math.min(
    getDisplayTimeTickMs(changedAt),
    getDisplayTimeTickMs(plan.lastTriggeredAt),
    plan.trigger?.mode === 'scheduled_at'
      ? getDisplayTimeTickMs(plan.trigger.scheduledAt, { relative: false })
      : 60_000,
  )
  const now = useNowTick(tickMs, open)
  const timeDisplay = formatDisplayTimeWithFull(changedAt, { now })
  const trigger =
    plan.trigger?.mode === 'cron'
      ? `cron:${plan.trigger.cron ?? ''}`
      : plan.trigger?.mode === 'scheduled_at'
        ? formatDisplayTimeWithFull(plan.trigger.scheduledAt, {
            calendarWords: true,
            now,
            relative: false,
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
        {trigger ? <span className="plan-trigger">{trigger}</span> : null}
        {timeDisplay.displayText ? (
          <span className="plan-time" title={timeDisplay.fullText || changedAt}>
            {timeDisplay.displayText}
          </span>
        ) : null}
      </small>
    </>
  )
  const taskContract = plan.taskContract
  const acceptance = taskContract?.acceptance ?? []
  const contextRefs = taskContract?.contextRefs ?? []
  const runCount =
    typeof plan.runCount === 'number' && Number.isFinite(plan.runCount)
      ? plan.runCount
      : null
  const lastTriggeredDisplay = plan.lastTriggeredAt
    ? formatDisplayTimeWithFull(plan.lastTriggeredAt, { now })
    : undefined
  const doneReason = plan.doneReason?.trim()
  const stage = plan.stage

  return (
    <li className="plan-item" data-status={plan.status ?? 'active'}>
      <div className="plan-item-main">
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
        <div className="plan-item-actions" data-plan-actions="true">
          <button
            ref={toggleRef}
            className="btn btn--icon btn--icon-muted plan-more-toggle"
            type="button"
            id={menuId}
            aria-controls={menuOpen ? `${menuId}-menu` : undefined}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={`More actions for ${plan.title?.trim() || UI_TEXT.untitledTask}`}
            disabled={!planId}
            onClick={() => {
              if (!planId) return
              onToggleMenu(planId)
            }}
          >
            ⋯
          </button>
          <PlanActionMenu
            menuId={menuId}
            menuOpen={menuOpen}
            onPlanAction={onPlanAction}
            planId={planId}
            toggleRef={toggleRef}
          />
        </div>
      </div>
      <PlanListItemProgress
        doneReason={doneReason}
        lastTriggeredAt={plan.lastTriggeredAt}
        lastTriggeredDisplay={lastTriggeredDisplay}
        runCount={runCount}
      />
      {stage ? <PlanListItemStage stage={stage} /> : null}
      {taskContract ? (
        <details className="plan-contract" aria-label="Plan contract">
          <summary className="plan-contract-summary">View contract</summary>
          <div className="plan-contract-body">
            <div className="plan-contract-row">
              <span className="plan-contract-label">Goal</span>
              <p className="plan-contract-text">{taskContract.goal}</p>
            </div>
            <div className="plan-contract-row">
              <span className="plan-contract-label">Scope</span>
              <p className="plan-contract-text">{taskContract.scope}</p>
            </div>
            {acceptance.length > 0 ? (
              <div className="plan-contract-row">
                <span className="plan-contract-label">Acceptance</span>
                <ul className="plan-contract-list">
                  {acceptance.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {taskContract.outOfScope ? (
              <div className="plan-contract-row">
                <span className="plan-contract-label">Out of scope</span>
                <p className="plan-contract-text">{taskContract.outOfScope}</p>
              </div>
            ) : null}
            {contextRefs.length > 0 ? (
              <div className="plan-contract-row">
                <span className="plan-contract-label">Context refs</span>
                <ul className="plan-contract-list plan-contract-list--refs">
                  {contextRefs.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </li>
  )
}
