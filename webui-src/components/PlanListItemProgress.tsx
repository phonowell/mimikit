type Props = {
  doneReason: string | undefined
  lastTriggeredAt: string | undefined
  lastTriggeredDisplay:
    | {
        displayText: string
        fullText: string
      }
    | undefined
  runCount: number | null
}

export const PlanListItemProgress = ({
  doneReason,
  lastTriggeredAt,
  lastTriggeredDisplay,
  runCount,
}: Props) => {
  if (runCount === null && !lastTriggeredDisplay?.displayText && !doneReason)
    return null

  return (
    <section className="plan-progress" aria-label="Plan progress">
      {runCount !== null ? (
        <div className="plan-progress-row">
          <span className="plan-progress-label">Runs</span>
          <span className="plan-progress-value">{String(runCount)}</span>
        </div>
      ) : null}
      {lastTriggeredDisplay?.displayText ? (
        <div className="plan-progress-row">
          <span className="plan-progress-label">Last trigger</span>
          <span
            className="plan-progress-value"
            title={lastTriggeredDisplay.fullText || lastTriggeredAt}
          >
            {lastTriggeredDisplay.displayText}
          </span>
        </div>
      ) : null}
      {doneReason ? (
        <div className="plan-progress-row">
          <span className="plan-progress-label">State</span>
          <span className="plan-progress-value">{doneReason}</span>
        </div>
      ) : null}
    </section>
  )
}
