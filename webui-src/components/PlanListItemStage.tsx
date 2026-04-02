import type { PlanStageView } from '../types.js'

type Props = {
  stage: PlanStageView
}

export const PlanListItemStage = ({ stage }: Props) => (
  <div className="plan-stage" aria-label="Current stage">
    <div className="plan-stage-row">
      <span className="plan-stage-label">Current stage</span>
      <p className="plan-stage-text">{stage.summary}</p>
    </div>
    {stage.risk ? (
      <div className="plan-stage-row">
        <span className="plan-stage-label">Risk</span>
        <p className="plan-stage-text">{stage.risk}</p>
      </div>
    ) : null}
    {stage.needsDecision ? (
      <div className="plan-stage-row">
        <span className="plan-stage-label">Decision pending</span>
        <p className="plan-stage-text">
          Review the latest stage before continuing.
        </p>
      </div>
    ) : null}
  </div>
)
