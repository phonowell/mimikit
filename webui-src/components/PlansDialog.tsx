import { UI_TEXT } from '../lib/system-text.js'

import { CopyFeedbackNotice } from './CopyFeedbackNotice.js'
import { ModalDialog } from './ModalDialog.js'
import { PlanListItem } from './PlanListItem.js'

import type { CopyFeedbackState, PlanView } from '../types.js'

type Props = {
  copyFeedback: CopyFeedbackState | null
  open: boolean
  openMenuId: string
  onClearCopyFeedback: () => void
  onClose: () => void
  onPlanAction: (planId: string, action: 'copy-id') => void
  onToggleMenu: (planId: string) => void
  plans: PlanView[]
}

export const PlansDialog = ({
  copyFeedback,
  open,
  openMenuId,
  onClearCopyFeedback,
  onClose,
  onPlanAction,
  onToggleMenu,
  plans,
}: Props) => (
  <ModalDialog
    open={open}
    className="plans-dialog"
    id="plans-dialog"
    labelledBy="plans-title"
    onClose={onClose}
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
      <CopyFeedbackNotice
        feedback={copyFeedback}
        label="Plan copy feedback"
        onClear={onClearCopyFeedback}
      />
      <ul className="plans-list scrollable">
        {plans.length === 0 ? (
          <li className="list-empty plans-empty">{UI_TEXT.noPlans}</li>
        ) : null}
        {plans.map((plan, index) => (
          <PlanListItem
            key={plan.id ?? `plan-${index}`}
            open={open}
            openMenuId={openMenuId}
            onPlanAction={onPlanAction}
            onToggleMenu={onToggleMenu}
            plan={plan}
          />
        ))}
      </ul>
    </section>
  </ModalDialog>
)
