import { formatUiError } from '../../webui/system-text.js'

import type { AppState } from '../types.js'
import type { Dispatch, SetStateAction } from 'react'

export const appendClientError = (
  setAppState: Dispatch<SetStateAction<AppState>>,
  error: unknown,
) => {
  const message = error instanceof Error ? error.message : String(error)
  setAppState((current) => ({
    ...current,
    awaitingReply: false,
    messages: [
      ...current.messages,
      {
        id: `client-error-${Date.now()}`,
        role: 'system',
        text: formatUiError(message),
      },
    ],
  }))
}
