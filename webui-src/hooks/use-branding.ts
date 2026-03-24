import { useEffect } from 'react'

import { syncDocumentBranding } from '../lib/branding.js'

import type { FocusView, StatusSnapshot } from '../types.js'

export const useBranding = (
  status: StatusSnapshot,
  focuses: readonly FocusView[],
): void => {
  useEffect(() => {
    syncDocumentBranding(status, focuses)
  }, [focuses, status])
}
