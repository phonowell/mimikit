import { useEffect } from 'react'

import { resolveDocumentTitle, syncDocumentBranding } from '../lib/branding.js'

import type { DocumentTitleContext } from '../lib/branding.js'
import type { StatusSnapshot } from '../types.js'

export const useBranding = (
  status: StatusSnapshot,
  context: DocumentTitleContext,
): void => {
  const agentStatus = status.agentStatus.trim().toLowerCase() || 'disconnected'
  const title = resolveDocumentTitle(context)

  useEffect(() => {
    syncDocumentBranding(status, context)
  }, [agentStatus, title])
}
