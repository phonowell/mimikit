import { useEffect } from 'react'

import type { CopyFeedbackState } from '../types.js'

const HIDE_DELAY_MS = 2_800

type Props = {
  feedback: CopyFeedbackState | null
  label: string
  onClear: () => void
}

export const CopyFeedbackNotice = ({ feedback, label, onClear }: Props) => {
  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(onClear, HIDE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [feedback, onClear])

  return (
    <p
      className="dialog-copy-feedback"
      data-state={feedback?.state ?? ''}
      hidden={!feedback}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={label}
    >
      {feedback?.message ?? ''}
    </p>
  )
}
