import { useEffect } from 'react'

import { resolveDocumentTitle, syncDocumentBranding } from '../lib/branding.js'

import type { FocusView, StatusSnapshot } from '../types.js'

export const useBranding = (
  status: StatusSnapshot,
  focuses: readonly FocusView[],
): void => {
  const agentStatus = status.agentStatus.trim().toLowerCase() || 'disconnected'
  const title = resolveDocumentTitle(focuses)

  useEffect(() => {
    syncDocumentBranding(status, focuses)
  }, [agentStatus, title])
}
